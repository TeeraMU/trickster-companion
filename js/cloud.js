// Optional Google sign-in + cloud copy of your progress (Firebase Auth + Firestore), local-first:
// the app works fully without signing in; signing in keeps one copy per Google account at
// users/{uid} and keeps every signed-in device in step. The Firebase SDK is only downloaded
// when someone signs in (or was signed in on this device before).
// What is synced and how two copies combine: js/sync-merge.js. Security rules: firestore.rules.
(function (root) {
  "use strict";

  // Public web config (not a secret: it only names the project; access is decided by firestore.rules)
  const CONFIG = {
    apiKey: "AIzaSyBKrgLKRKoZbWJS8LoziONJdxh5_fzLG_A",
    authDomain: "trickster-companion.firebaseapp.com",
    projectId: "trickster-companion",
    storageBucket: "trickster-companion.firebasestorage.app",
    messagingSenderId: "225276794407",
    appId: "1:225276794407:web:cf9238febdd5f904462002"
  };
  const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  const SDK_FILES = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];
  const KEY_ON = "tc_cloud";          // "1" while this device is signed in (load the SDK on start)
  const KEY_UID = "tc_cloud_uid";     // the account this device's local progress was last joined to
  const KEY_DEVICE = "tc_device";     // random id, so a device ignores its own writes coming back
  const KEY_DIRTY = "tc_cloud_dirty"; // "1" = changed here while signed in, not pushed yet (offline…)
  const PUSH_DELAY = 1500;

  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } }
  };
  const device = store.get(KEY_DEVICE) || Math.random().toString(36).slice(2, 10);
  store.set(KEY_DEVICE, device);

  let ctx = null;          // { getPayload, applyPayload, choose, onStatus }
  let fb = null, auth = null, db = null, user = null, unsubscribe = null;
  let sdkPromise = null, pushTimer = null, ready = false, applying = false;
  let status = { state: "signed-out" };

  function setStatus(s) {
    status = Object.assign({ user: user ? { name: user.displayName || "", email: user.email || "" } : null }, s);
    if (ctx && ctx.onStatus) ctx.onStatus(status);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(el);
    });
  }

  function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = SDK_FILES.reduce((p, f) => p.then(() => loadScript(SDK + f)), Promise.resolve()).then(() => {
        fb = root.firebase;
        if (!fb.apps.length) fb.initializeApp(CONFIG);
        auth = fb.auth();
        db = fb.firestore();
        auth.onAuthStateChanged(onUser);
        return auth.getRedirectResult().catch(() => null); // finishes a redirect sign-in (phones)
      }).catch(e => { sdkPromise = null; throw e; });
    }
    return sdkPromise;
  }

  const docRef = () => db.collection("users").doc(user.uid);

  async function onUser(u) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    user = u;
    ready = false;
    if (!u) { store.del(KEY_ON); setStatus({ state: "signed-out" }); return; }
    store.set(KEY_ON, "1");
    setStatus({ state: "loading" });
    try {
      await join();
      ready = true;
      listen();
    } catch (e) {
      console.warn("Cloud sync:", e);
      setStatus({ state: "error", message: friendly(e) });
    }
  }

  // First time this account meets this device's progress: decide which copy to keep.
  async function join() {
    const snap = await docRef().get();
    const cloud = snap.exists ? (snap.data() || {}).progress : null;
    const local = ctx.getPayload();
    const known = store.get(KEY_UID) === user.uid;
    let keep;
    if (!cloud || TQSync.isEmpty(cloud)) keep = local;
    else if (TQSync.isEmpty(local) || TQSync.same(local, cloud)) keep = cloud;
    // this device was joined before: the cloud copy is newer, unless something here never got pushed
    else if (known) keep = store.get(KEY_DIRTY) === "1" ? TQSync.merge(local, cloud) : cloud;
    else {
      const choice = await ctx.choose(TQSync.summary(local), TQSync.summary(cloud));
      keep = choice === "local" ? local : choice === "merge" ? TQSync.merge(local, cloud) : cloud;
    }
    if (!TQSync.same(keep, local)) apply(keep);
    if (!cloud || !TQSync.same(keep, cloud)) await write(keep);
    store.del(KEY_DIRTY);
    store.set(KEY_UID, user.uid);
    setStatus({ state: "synced", at: Date.now() });
  }

  // Changes from the user's other devices
  function listen() {
    unsubscribe = docRef().onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites || !snap.exists) return;
      const d = snap.data() || {};
      if (d.device === device || !d.progress) return;
      if (!TQSync.same(d.progress, ctx.getPayload())) apply(d.progress);
      setStatus({ state: "synced", at: Date.now() });
    }, e => setStatus({ state: "error", message: friendly(e) }));
  }

  function apply(progress) {
    applying = true;
    try { ctx.applyPayload(progress); } finally { applying = false; }
  }

  function write(progress) {
    return docRef().set({
      schema: TQSync.SCHEMA,
      progress,
      device,
      updatedAt: fb.firestore.FieldValue.serverTimestamp()
    });
  }

  // Called after every local save: push a moment later (several ticks in a row = one write)
  function changed() {
    if (applying || store.get(KEY_ON) !== "1") return;
    store.set(KEY_DIRTY, "1");
    if (!user || !ready) return; // still starting up: join() merges it in
    clearTimeout(pushTimer);
    setStatus({ state: "saving" });
    pushTimer = setTimeout(() => {
      write(ctx.getPayload())
        .then(() => { store.del(KEY_DIRTY); setStatus({ state: "synced", at: Date.now() }); })
        .catch(e => setStatus({ state: navigator.onLine ? "error" : "offline", message: friendly(e) }));
    }, PUSH_DELAY);
  }

  async function signIn() {
    setStatus({ state: "loading" });
    try {
      await loadSdk();
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        // popups blocked (some phones / in-app browsers): go to Google and come back
        if (/popup-blocked|operation-not-supported|cancelled-popup/.test(e.code || "")) await auth.signInWithRedirect(provider);
        else throw e;
      }
    } catch (e) {
      const closed = /popup-closed-by-user|cancelled-popup-request/.test(e.code || "");
      setStatus(closed ? { state: "signed-out" } : { state: "error", message: friendly(e) });
    }
  }

  async function signOut() {
    if (!auth) return;
    clearTimeout(pushTimer);
    await auth.signOut(); // progress stays in this browser
    store.del(KEY_ON);
  }

  function friendly(e) {
    const c = (e && e.code) || "";
    if (/unauthorized-domain/.test(c)) return "This site isn't allowed to sign in yet (Firebase: Authorized domains).";
    if (/permission-denied/.test(c)) return "The cloud refused the save (Firestore rules).";
    if (/network|unavailable/.test(c) || !navigator.onLine) return "You're offline. Progress is saved here and will sync later.";
    return (e && e.message) || "Something went wrong.";
  }

  // ctx: getPayload() -> progress, applyPayload(progress), choose(localSummary, cloudSummary) ->
  // Promise<"local"|"cloud"|"merge">, onStatus(status)
  function init(context) {
    ctx = context;
    setStatus({ state: "signed-out" });
    if (store.get(KEY_ON) === "1") {
      setStatus({ state: "loading" });
      loadSdk().catch(e => setStatus({ state: "error", message: friendly(e) }));
    }
  }

  root.TQCloud = { init, signIn, signOut, changed, status: () => status };
})(this);

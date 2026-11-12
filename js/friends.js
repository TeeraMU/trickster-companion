// Friends: share a short progress summary under a friend code, and follow friends by their code.
// Needs the Google sign-in from js/cloud.js. Firestore (rules in firestore.rules):
//   social/{uid}     { name, code, friends: [code], updatedAt }   only its owner
//   profiles/{code}  { ownerUid, name, cls, path, done, total, area, next, needs, spares, updatedAt }
//                    readable by any signed-in player who knows the code, written only by its owner
// Pure helpers (codes, names, matching, "seen" times) run under Node: node scripts/test-friends.js
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------------------------
  // Pure helpers
  // ---------------------------------------------------------------------------------------------
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: easy to read out and type
  const CODE_RE = /^TC-[A-Z0-9]{4}-[A-Z0-9]{2}$/;

  function makeCode(random) {
    const r = random || Math.random;
    const pick = n => Array.from({ length: n }, () => ALPHABET[Math.floor(r() * ALPHABET.length)]).join("");
    return `TC-${pick(4)}-${pick(2)}`;
  }

  // what people paste: "tc 7f3k9q", "TC-7F3K-9Q " … -> "TC-7F3K-9Q" (or null)
  function normalizeCode(text) {
    const s = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^TC/, "");
    if (s.length !== 6) return null;
    const code = `TC-${s.slice(0, 4)}-${s.slice(4)}`;
    return CODE_RE.test(code) ? code : null;
  }

  // 2-20 letters, numbers, spaces, _ - . (any script: \p{M} keeps Thai vowel and tone marks)
  function cleanName(text) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 20) return null;
    return /^[\p{L}\p{M}\p{N} _.\-]+$/u.test(s) ? s : null;
  }

  // what one side can hand the other: items in `from.spares` that `to.needs`
  function canGive(from, to) {
    const need = new Map((to && to.needs || []).map(x => [x.item, x.n]));
    return (from && from.spares || []).filter(x => need.has(x.item))
      .map(x => ({ item: x.item, n: Math.min(x.n, need.get(x.item)) }));
  }

  function timeAgo(ms, now) {
    if (!ms) return "";
    const s = Math.max(0, Math.round(((now || Date.now()) - ms) / 1000));
    if (s < 90) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} days ago`;
  }

  const helpers = { makeCode, normalizeCode, cleanName, canGive, timeAgo, CODE_RE };
  if (typeof module !== "undefined" && module.exports) { module.exports = helpers; return; }

  // ---------------------------------------------------------------------------------------------
  // Firestore side (browser)
  // ---------------------------------------------------------------------------------------------
  let ctx = null;            // { summary(): profile fields, render() }
  let user = null;
  let me = null;             // social doc { name, code, friends } or null (not set up yet)
  let meLoaded = false;
  const friendData = new Map(); // code -> { data } | { missing: true }
  const unsubs = new Map();     // code -> unsubscribe
  let unsubMe = null, publishTimer = null, lastPublished = "", busy = false, error = "";

  const db = () => TQCloud.db();
  const socialRef = () => db().collection("social").doc(user.uid);
  const profileRef = code => db().collection("profiles").doc(code);

  function init(context) {
    ctx = context;
    TQCloud.onReady(onUser);
  }

  function onUser(u) {
    stopAll();
    user = u;
    me = null; meLoaded = false; error = "";
    if (!u) { ctx.render(); return; }
    unsubMe = socialRef().onSnapshot(snap => {
      me = snap.exists ? snap.data() : null;
      meLoaded = true;
      followFriends();
      ctx.render();
      if (me) changed();
    }, e => { error = msg(e); meLoaded = true; ctx.render(); });
  }

  function stopAll() {
    if (unsubMe) { unsubMe(); unsubMe = null; }
    unsubs.forEach(u => u());
    unsubs.clear();
    friendData.clear();
    clearTimeout(publishTimer);
    lastPublished = "";
  }

  function followFriends() {
    const want = new Set((me && me.friends) || []);
    for (const [code, u] of unsubs) if (!want.has(code)) { u(); unsubs.delete(code); friendData.delete(code); }
    for (const code of want) {
      if (unsubs.has(code)) continue;
      unsubs.set(code, profileRef(code).onSnapshot(
        snap => { friendData.set(code, snap.exists ? { data: snap.data() } : { missing: true }); ctx.render(); },
        () => { friendData.set(code, { missing: true }); ctx.render(); }));
    }
  }

  function msg(e) {
    const c = (e && e.code) || "";
    if (/permission-denied/.test(c)) return "The cloud refused this (check that the latest Firestore rules are published).";
    if (/unavailable|network/.test(c) || !navigator.onLine) return "You're offline. Try again when you're back online.";
    return (e && e.message) || "Something went wrong.";
  }

  async function run(task) {
    if (busy) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // let the page redraw
    busy = true; error = ""; ctx.render();
    try { await task(); } catch (e) { error = e.userMessage || msg(e); }
    busy = false; ctx.render();
  }

  // a new profile under a fresh code (a taken code is refused by the rules: try another)
  async function claimCode(name) {
    for (let i = 0; i < 5; i++) {
      const code = makeCode();
      try {
        await profileRef(code).set(profileDoc(name));
        return code;
      } catch (e) {
        if (!/permission-denied/.test(e.code || "") || i === 4) throw e;
      }
    }
  }

  function profileDoc(name) {
    const s = ctx.summary();
    return {
      ownerUid: user.uid, name,
      cls: s.cls || "All", path: s.path || "", done: s.done || 0, total: s.total || 0,
      area: s.area || "", next: s.next || "",
      needs: (s.needs || []).slice(0, 12), spares: (s.spares || []).slice(0, 12),
      updatedAt: TQCloud.serverTime()
    };
  }

  function setName(text) {
    const name = cleanName(text);
    if (!name) { error = "Use 2-20 letters or numbers (spaces, _ - . are fine)."; ctx.render(); return; }
    run(async () => {
      if (me && me.code) {
        await socialRef().set({ name, code: me.code, friends: me.friends || [], updatedAt: TQCloud.serverTime() });
        lastPublished = "";
        await publishNow();
      } else {
        const code = await claimCode(name);
        await socialRef().set({ name, code, friends: (me && me.friends) || [], updatedAt: TQCloud.serverTime() });
      }
    });
  }

  // new code: the old one stops working for everyone who had it
  function newCode() {
    if (!me || !confirm("Make a new friend code? Friends who have your old code won't see you any more until you give them the new one.")) return;
    run(async () => {
      const old = me.code;
      const code = await claimCode(me.name);
      await socialRef().set({ name: me.name, code, friends: me.friends || [], updatedAt: TQCloud.serverTime() });
      if (old) await profileRef(old).delete().catch(() => null);
    });
  }

  function addFriend(text) {
    const code = normalizeCode(text);
    if (!code) { error = "That doesn't look like a friend code (TC-XXXX-XX)."; ctx.render(); return; }
    if (me && code === me.code) { error = "That's your own code."; ctx.render(); return; }
    if (me && (me.friends || []).includes(code)) { error = "Already in your list."; ctx.render(); return; }
    run(async () => {
      const snap = await profileRef(code).get();
      if (!snap.exists) { const e = new Error(); e.userMessage = `No one has the code ${code}. Check it, or ask your friend for their current code.`; throw e; }
      await socialRef().set({ name: me.name, code: me.code, friends: [...(me.friends || []), code], updatedAt: TQCloud.serverTime() });
    });
  }

  function removeFriend(code) {
    if (!me) return;
    run(() => socialRef().set({ name: me.name, code: me.code, friends: (me.friends || []).filter(c => c !== code), updatedAt: TQCloud.serverTime() }));
  }

  // after local changes: refresh the shared summary a few seconds later, only if it changed
  function changed() {
    if (!user || !me || !me.code) return;
    clearTimeout(publishTimer);
    publishTimer = setTimeout(() => publishNow().catch(e => { error = msg(e); ctx.render(); }), 4000);
  }

  async function publishNow() {
    if (!user || !me || !me.code) return;
    const doc = profileDoc(me.name);
    const key = JSON.stringify(Object.assign({}, doc, { updatedAt: 0 }));
    if (key === lastPublished) return;
    await profileRef(me.code).set(doc);
    lastPublished = key;
  }

  let copied = false;
  function copyCode() {
    if (!me) return;
    const done = () => { error = ""; copied = true; ctx.render(); setTimeout(() => { copied = false; ctx.render(); }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(me.code).then(done, () => prompt("Copy your friend code:", me.code));
    else prompt("Copy your friend code:", me.code);
  }

  // ---------------------------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const items = list => list.map(x => `${esc(x.item)} ×${x.n}`).join(", ");

  function render() {
    const cloud = TQCloud.status();
    if (!user) {
      const loading = cloud.state === "loading";
      return `
        <div class="friends-page">
          <div class="calc-card friends-intro">
            <h2>👥 Friends</h2>
            <p>See how far your friends are, what they still need, and what you can give each other.</p>
            <p class="friends-muted">Sign in with Google first (it also syncs your progress). Friends only see a short summary under the name you pick, never your Google name or email.</p>
            <button class="btn btn-google" onclick="TQCloud.signIn()" ${loading ? "disabled" : ""}>${loading ? "⏳ Signing in…" : "Sign in with Google"}</button>
          </div>
        </div>`;
    }
    if (!meLoaded) return `<div class="friends-page"><div class="calc-card">⏳ Loading friends…</div></div>`;
    const err = error ? `<p class="friends-error" role="alert">⚠️ ${esc(error)}</p>` : "";
    if (!me || !me.code) {
      return `
        <div class="friends-page">
          <div class="calc-card friends-intro">
            <h2>👥 Pick a name for your friends</h2>
            <p>Friends see this name with your class, how far you are, and the items you need or have spare. You get a friend code to share.</p>
            <form class="friends-form" onsubmit="event.preventDefault(); TQFriends.setName(this.name.value)">
              <input type="text" name="name" maxlength="20" placeholder="Your character name" value="${esc(me && me.name)}" required>
              <button class="btn btn-primary" ${busy ? "disabled" : ""}>${busy ? "⏳" : "Get my friend code"}</button>
            </form>
            ${err}
          </div>
        </div>`;
    }
    const mine = ctx.summary();
    const codes = me.friends || [];
    const cards = codes.map(code => friendCard(code, friendData.get(code), mine)).join("") ||
      `<p class="friends-muted">No friends yet. Ask a friend for their code and add it above.</p>`;
    return `
      <div class="friends-page">
        <div class="calc-card friends-me">
          <div class="friends-me-row">
            <div>
              <span class="friends-label">Your friend code</span>
              <span class="friend-code">${esc(me.code)}</span>
            </div>
            <button class="btn" onclick="TQFriends.copyCode()">${copied ? "✅ Copied" : "📋 Copy"}</button>
            <button class="btn" onclick="TQFriends.newCode()" title="The old code stops working">🔄 New code</button>
          </div>
          <form class="friends-form" onsubmit="event.preventDefault(); TQFriends.setName(this.name.value)">
            <span class="friends-label">Friends see you as</span>
            <input type="text" name="name" maxlength="20" value="${esc(me.name)}" required>
            <button class="btn" ${busy ? "disabled" : ""}>Save</button>
          </form>
          <form class="friends-form" onsubmit="event.preventDefault(); TQFriends.addFriend(this.code.value); this.code.value=''">
            <span class="friends-label">Add a friend</span>
            <input type="text" name="code" placeholder="TC-XXXX-XX" autocomplete="off" autocapitalize="characters" required>
            <button class="btn btn-primary" ${busy ? "disabled" : ""}>➕ Add</button>
          </form>
          ${err}
        </div>
        <div class="friends-list">${cards}</div>
      </div>`;
  }

  function friendCard(code, f, mine) {
    if (!f) return `<div class="calc-card friend-card"><span class="friends-muted">⏳ ${esc(code)}</span></div>`;
    if (f.missing) {
      return `<div class="calc-card friend-card friend-missing">
          <div class="friend-head"><strong>${esc(code)}</strong>
            <button class="icon-btn" onclick="TQFriends.removeFriend('${code}')" title="Remove" aria-label="Remove ${esc(code)}">✕</button></div>
          <p class="friends-muted">This code doesn't work any more (your friend made a new one). Ask them for the new code.</p>
        </div>`;
    }
    const d = f.data;
    const pct = d.total ? Math.round(d.done / d.total * 100) : 0;
    const seen = d.updatedAt && d.updatedAt.toMillis ? timeAgo(d.updatedAt.toMillis()) : "";
    const giveThem = canGive(mine, d), giveMe = canGive(d, mine);
    return `
      <div class="calc-card friend-card">
        <div class="friend-head">
          <strong class="friend-name">${esc(d.name)}</strong>
          <span class="friends-muted">${esc(d.cls && d.cls !== "All" ? d.cls : "")}${d.path ? " · " + esc(d.path) : ""}${seen ? " · seen " + seen : ""}</span>
          <button class="icon-btn" onclick="TQFriends.removeFriend('${code}')" title="Remove" aria-label="Remove ${esc(d.name)}">✕</button>
        </div>
        <div class="friend-bar" role="img" aria-label="${pct}% done"><span style="width:${pct}%"></span></div>
        <p class="friend-line">${d.done} / ${d.total} quests (${pct}%)${d.area ? ` · now in <b>${esc(d.area)}</b>` : ""}</p>
        ${d.next ? `<p class="friend-line">➡️ Next: ${esc(d.next)}</p>` : ""}
        <div class="friend-tags">
          ${giveThem.length ? `<span class="friend-tag tag-give">🎁 You can give: ${items(giveThem)}</span>` : ""}
          ${giveMe.length ? `<span class="friend-tag tag-get">🤝 They have spare: ${items(giveMe)}</span>` : ""}
          ${(d.needs || []).length ? `<span class="friend-tag tag-need">🎯 Needs: ${items(d.needs.slice(0, 6))}</span>` : ""}
          ${(d.spares || []).length ? `<span class="friend-tag tag-spare">💰 Spare: ${items(d.spares.slice(0, 6))}</span>` : ""}
        </div>
      </div>`;
  }

  root.TQFriends = Object.assign({ init, render, setName, newCode, addFriend, removeFriend, copyCode, changed, signedIn: () => !!user }, helpers);
})(this);

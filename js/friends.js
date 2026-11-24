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

  // A friend's whole Bag for the 🎒 box on their card. `want` = { item: how many you still need }.
  // Items you need come first (most first), then the rest (most first, then A-Z), cut at `limit`.
  // `query` keeps names containing it and lifts the limit.
  function bagView(bag, want, opts) {
    const o = opts || {}, limit = o.limit == null ? 20 : o.limit;
    const q = String(o.query || "").trim().toLowerCase();
    const all = Object.entries(bag || {}).filter(([, n]) => n > 0)
      .map(([item, n]) => ({ item, n }))
      .sort((a, b) => b.n - a.n || a.item.localeCompare(b.item));
    const wantN = item => (want && want[item]) || 0;
    const match = all.filter(x => !q || x.item.toLowerCase().includes(q));
    const wanted = match.filter(x => wantN(x.item) > 0).map(x => ({ item: x.item, n: x.n, need: wantN(x.item) }));
    const others = match.filter(x => !(wantN(x.item) > 0));
    const cut = q || limit <= 0 ? others.length : Math.min(limit, others.length);
    return {
      total: all.length,
      wantedCount: all.filter(x => wantN(x.item) > 0).length,
      matches: match.length,
      wanted, rest: others.slice(0, cut), hidden: others.length - cut
    };
  }

  /**
   * The builds a player lets friends see (🛠️ Planner, "Friends can see it"): at most 5, each cleaned
   * by `clean` (TQPlanner.cleanBuild), without the local "shared" flag.
   */
  const MAX_SHARED_BUILDS = 5;
  function sharedBuilds(builds, clean) {
    return (Array.isArray(builds) ? builds : []).filter(b => b && b.shared).slice(0, MAX_SHARED_BUILDS)
      .map(b => { const c = clean ? clean(b) : null; if (c) delete c.shared; return c; }).filter(Boolean);
  }

  const helpers = { makeCode, normalizeCode, cleanName, canGive, timeAgo, bagView, sharedBuilds, MAX_SHARED_BUILDS, CODE_RE };
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
    for (const [code, u] of unsubs) if (!want.has(code)) { u(); unsubs.delete(code); friendData.delete(code); if (ctx.onData) ctx.onData(); }
    for (const code of want) {
      if (unsubs.has(code)) continue;
      unsubs.set(code, profileRef(code).onSnapshot(
        snap => { friendData.set(code, snap.exists ? { data: snap.data() } : { missing: true }); ctx.render(); if (ctx.onData) ctx.onData(); },
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
      focus: s.focus ? { label: String(s.focus.label).slice(0, 80), done: s.focus.done || 0, total: s.focus.total || 0 } : null,
      bag: bagCounts(s.bag),
      builds: sharedBuilds(s.builds, ctx.cleanBuild),
      updatedAt: TQCloud.serverTime()
    };
  }

  // the whole Bag ({ item: count }), so friends see "👥 you ×12" next to items; capped in size
  function bagCounts(bag) {
    const out = {};
    Object.entries(bag || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 400)
      .forEach(([item, n]) => { out[item] = Math.min(999, n); });
    return out;
  }

  // friends who have an item: [{ name, n }] most first
  function holdings(item) {
    const out = [];
    for (const f of friendData.values()) {
      const d = f && f.data;
      const n = d && d.bag && d.bag[item];
      if (n > 0) out.push({ name: d.name, n });
    }
    return out.sort((a, b) => b.n - a.n);
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
            <p>Friends see this name with your class, how far you are, the items you need or have spare, and how many of each item is in your Bag. You get a friend code to share.</p>
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
            ${avatar(mine.cls, mine.path)}
            <input type="text" name="name" maxlength="20" value="${esc(me.name)}" required>
            <button class="btn" ${busy ? "disabled" : ""}>Save</button>
          </form>
          <label class="friends-share">
            <input type="checkbox" ${mine.shareBag !== false ? "checked" : ""} onchange="setShareBag(this.checked)">
            <span><strong>Share my Bag</strong> <span class="friends-muted">· friends see how many of each item you have and your spares</span></span>
          </label>
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

  // job sprite (3rd job if picked, else the class's 1st job); a plain 👤 when the class isn't known
  function avatar(cls, path) {
    const icon = ctx.classIcon && cls && cls !== "All" ? ctx.classIcon(cls, path) : null;
    return icon
      ? `<span class="friend-avatar" title="${esc(icon.name)}"><img src="${esc(icon.url)}" alt="${esc(icon.name)}" loading="lazy"></span>`
      : `<span class="friend-avatar friend-avatar-none" aria-hidden="true">👤</span>`;
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
          ${avatar(d.cls, d.path)}
          <strong class="friend-name">${esc(d.name)}</strong>
          <span class="friends-muted">${esc(d.cls && d.cls !== "All" ? d.cls : "")}${d.path ? " · " + esc(d.path) : ""}${seen ? " · seen " + seen : ""}</span>
          <button class="icon-btn" onclick="TQFriends.removeFriend('${code}')" title="Remove" aria-label="Remove ${esc(d.name)}">✕</button>
        </div>
        <div class="friend-bar" role="img" aria-label="${pct}% done"><span style="width:${pct}%"></span></div>
        <p class="friend-line">${d.done} / ${d.total} quests (${pct}%)${d.area ? ` · now in <b>${esc(d.area)}</b>` : ""}</p>
        ${d.next ? `<p class="friend-line">➡️ Next: ${esc(d.next)}</p>` : ""}
        ${d.focus ? `<p class="friend-line friend-focus">📌 Focus: <b>${esc(d.focus.label)}</b> (${d.focus.done} / ${d.focus.total} done)</p>` : ""}
        <div class="friend-tags">
          ${giveThem.length ? `<span class="friend-tag tag-give">🎁 You can give: ${items(giveThem)}</span>` : ""}
          ${giveMe.length ? `<span class="friend-tag tag-get">🤝 They have spare: ${items(giveMe)}</span>` : ""}
          ${(d.needs || []).length ? `<span class="friend-tag tag-need">🎯 Needs: ${items(d.needs.slice(0, 6))}</span>` : ""}
          ${(d.spares || []).length ? `<span class="friend-tag tag-spare">💰 Spare: ${items(d.spares.slice(0, 6))}</span>` : ""}
        </div>
        ${bagBox(code, d, mine)}
        ${buildsLine(code, d)}
      </div>`;
  }

  // 🛠️ the builds the friend shares: tap one to open it (read only) on the Planner page
  function buildsLine(code, d) {
    const list = Array.isArray(d.builds) ? d.builds : [];
    if (!list.length) return "";
    return `<div class="friend-builds"><span class="friend-builds-label">🛠️ Builds</span>${list.map((b, i) =>
      `<button type="button" class="friend-build" onclick="TQFriends.openBuild('${code}', ${i})" title="Open ${esc(b.name)} (read only)">
        <strong>${esc(b.name)}</strong> <span class="friends-muted">${esc(b.job || b.cls)} · Lv.${Number(b.level) || 1}</span></button>`).join("")}</div>`;
  }
  function openBuild(code, i) {
    const f = friendData.get(code);
    const b = f && f.data && Array.isArray(f.data.builds) ? f.data.builds[i] : null;
    if (b && ctx.openBuild) ctx.openBuild(b, f.data.name);
  }

  // 🎒 the friend's whole Bag, folded away: what you need first, a filter, then the rest
  const bagState = new Map(); // code -> { open, query, all } (this page only)
  const bagOf = code => { if (!bagState.has(code)) bagState.set(code, { open: false, query: "", all: false }); return bagState.get(code); };

  function bagBox(code, d, mine) {
    const v = bagView(d.bag, mine.want);
    if (!v.total) return `<p class="friend-line friends-muted fb-none">🎒 Bag not shared (or empty)</p>`;
    const st = bagOf(code);
    return `
      <details class="fb-box" ${st.open ? "open" : ""} ontoggle="TQFriends.bagToggle('${code}', this.open)">
        <summary><span aria-hidden="true">🎒</span> Bag <span class="friends-muted">· ${v.total} items</span>
          ${v.wantedCount ? `<span class="fb-want-count">· ${v.wantedCount} you need</span>` : ""}</summary>
        ${v.total > 12 ? `<input type="search" class="fb-filter" placeholder="Find an item in ${esc(d.name)}'s Bag" value="${esc(st.query)}"
          oninput="TQFriends.bagFilter('${code}', this.value)" aria-label="Find an item in ${esc(d.name)}'s Bag">` : ""}
        <div class="fb-list" id="fb-${code}">${bagListHtml(code, d, mine)}</div>
      </details>`;
  }

  function bagListHtml(code, d, mine) {
    const st = bagOf(code);
    const v = bagView(d.bag, mine.want, { query: st.query, limit: st.all ? 0 : 20 });
    if (!v.matches) return `<p class="friends-muted">No item matches “${esc(st.query)}”.</p>`;
    const chip = (x, need) => {
      const img = ctx.itemImage ? ctx.itemImage(x.item) : "";
      return `<button type="button" class="fb-item ${need ? "is-want" : ""}" onclick="TQSearch.open(this.dataset.item)" data-item="${esc(x.item)}"
          title="${esc(x.item)}: ${d.name ? esc(d.name) + " has " : ""}${x.n}${need ? ` · you need ${need}` : ""} (tap to look it up)">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}<span class="fb-name">${esc(x.item)}</span>
          <span class="fb-n">×${x.n}</span>${need ? `<span class="fb-need">you need ${need}</span>` : ""}</button>`;
    };
    return (v.wanted.length ? `<p class="fb-head">🎯 You need</p><div class="fb-chips">${v.wanted.map(x => chip(x, x.need)).join("")}</div>` : "") +
      (v.rest.length ? `${v.wanted.length ? `<p class="fb-head">Everything else</p>` : ""}<div class="fb-chips">${v.rest.map(x => chip(x, 0)).join("")}</div>` : "") +
      (v.hidden ? `<button type="button" class="btn fb-more" onclick="TQFriends.bagAll('${code}', true)">Show all (${v.hidden} more)</button>`
        : st.all && !st.query && v.rest.length > 20 ? `<button type="button" class="btn fb-more" onclick="TQFriends.bagAll('${code}', false)">Show less</button>` : "");
  }

  // the filter and Show all redraw only the list, so typing keeps the focus
  function redrawBag(code) {
    const el = typeof document !== "undefined" && document.getElementById("fb-" + code);
    const f = friendData.get(code);
    if (el && f && f.data) el.innerHTML = bagListHtml(code, f.data, ctx.summary());
  }
  function bagToggle(code, open) { bagOf(code).open = open; }
  function bagFilter(code, text) { bagOf(code).query = text; redrawBag(code); }
  function bagAll(code, on) { bagOf(code).all = on; redrawBag(code); }

  root.TQFriends = Object.assign({ init, render, setName, newCode, addFriend, removeFriend, copyCode, changed, holdings, bagToggle, bagFilter, bagAll, openBuild, signedIn: () => !!user }, helpers);
})(this);

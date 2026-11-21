// Build planner: the Build guide's 🛡️ Equipment tab. Gear in 12 slots from data/equipment.json (the
// PlayTrickster client tables, old base values), custom items, bonuses typed in per piece (Refine,
// Compound, random), buffs, the "+gear" stat totals and elements, and saved builds (synced).
// The model is pure and runs under Node (node scripts/test-planner.js); the renderer gets what it
// needs through a context object.
(function (root) {
  "use strict";

  const STATS = ["AP", "AC", "DX", "MP", "MA", "MD", "WT", "DA", "LK", "HP", "DP", "HV"];
  const ELEMENTS = ["Fire", "Water", "Wind", "Earth", "Elec", "Light", "Dark"];
  // the equipment window's slots; `slot` is the item kind that fits
  const SLOTS = [
    { key: "weapon", slot: "weapon", label: "Weapon", icon: "⚔️" },
    { key: "shield", slot: "shield", label: "Shield", icon: "🛡️" },
    { key: "hat", slot: "hat", label: "Hat", icon: "🎩" },
    { key: "acc1", slot: "accessory", label: "Accessory 1", icon: "💍" },
    { key: "acc2", slot: "accessory", label: "Accessory 2", icon: "💍" },
    { key: "pet", slot: "pet", label: "Pet", icon: "🐾" },
    { key: "cape", slot: "cape", label: "Cape", icon: "🧣" },
    { key: "inner", slot: "inner", label: "Inner", icon: "🎽" },
    { key: "ear", slot: "ear", label: "Ears", icon: "👂" },
    { key: "tail", slot: "tail", label: "Tail", icon: "🦊" },
    { key: "fashion1", slot: "fashion", label: "Fashion 1", icon: "👗" },
    { key: "fashion2", slot: "fashion", label: "Fashion 2", icon: "👒" }
  ];
  const SLOT_KINDS = [...new Set(SLOTS.map(s => s.slot))];
  const LIMITS = { builds: 20, custom: 30, buffs: 20, adds: 8, name: 40, notes: 500 };

  const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)));
  const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

  /** { AP: 12, … } with known keys, whole numbers, no zeros. */
  function cleanStats(o, keys) {
    const out = {};
    for (const k of keys || STATS) { const v = clamp(o && o[k], -99999999, 99999999); if (v) out[k] = v; }
    return out;
  }

  /** Index of the catalog by id, for quick lookups. */
  function indexCatalog(cat) {
    const byId = new Map();
    for (const it of (cat && cat.items) || []) byId.set(String(it.id), it);
    return byId;
  }

  /** The item in a slot: a catalog id, or "c:…" for one of the build's custom items. */
  function itemFor(ref, build, byId) {
    if (!ref) return null;
    if (String(ref).startsWith("c:")) return (build.custom || []).find(c => c.id === ref) || null;
    return (byId && byId.get(String(ref))) || null;
  }

  /**
   * Stat and element totals of a build.
   * Returns { gear: {AP…}, adds: {AP…}, buffs: {AP…}, plus: {AP…} (all three), elements: {Fire…},
   *           resist: {Fire…}, pieces: [{ key, item, missing }] }
   */
  function totals(build, byId) {
    const gear = {}, adds = {}, buffs = {}, plus = {}, elements = {}, resist = {};
    const add = (to, src) => { for (const [k, v] of Object.entries(src || {})) to[k] = (to[k] || 0) + v; };
    const pieces = [];
    for (const s of SLOTS) {
      const g = (build.gear || {})[s.key];
      if (!g || !g.id) continue;
      const item = itemFor(g.id, build, byId);
      pieces.push({ key: s.key, item, missing: !item });
      if (!item) continue;
      add(gear, item.st);
      add(elements, item.e);
      add(resist, item.r);
      add(adds, g.add);
    }
    for (const b of build.buffs || []) if (b.on && b.value) add(buffs, { [b.stat]: b.value });
    for (const k of STATS) {
      const v = (gear[k] || 0) + (adds[k] || 0) + (buffs[k] || 0);
      if (v) plus[k] = v;
    }
    // buff lines can also be an element ("Fire" +20)
    for (const b of build.buffs || []) if (b.on && b.value && ELEMENTS.includes(b.stat)) elements[b.stat] = (elements[b.stat] || 0) + b.value;
    return { gear, adds, buffs, plus, elements, resist, pieces };
  }

  /** What changes if `next` replaces `cur` (either may be null): { AP: +40, MD: -12 } */
  function diff(cur, next) {
    const out = {};
    for (const k of STATS) {
      const d = ((next && next.st && next.st[k]) || 0) - ((cur && cur.st && cur.st[k]) || 0);
      if (d) out[k] = d;
    }
    return out;
  }

  /**
   * Items for a slot kind, best matches first: name words in any order, `maxLevel` hides items the
   * character can't wear yet. Custom items of the build come first. Returns { list, more }.
   */
  function search(cat, build, opts) {
    const o = Object.assign({ slot: "weapon", query: "", maxLevel: 0, limit: 40 }, opts);
    const words = String(o.query).toLowerCase().split(/\s+/).filter(Boolean);
    const ok = it => it.s === o.slot && (!o.maxLevel || (it.l || 0) <= o.maxLevel) &&
      words.every(w => it.n.toLowerCase().includes(w) || String(it.id) === w);
    const custom = (build.custom || []).filter(ok);
    const found = ((cat && cat.items) || []).filter(ok)
      .sort((a, b) => (b.l || 0) - (a.l || 0) || a.n.localeCompare(b.n));
    const all = [...custom, ...found];
    return { list: all.slice(0, o.limit), more: Math.max(0, all.length - o.limit) };
  }

  const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /**
   * A build from anything (saved data, cloud, an import): known fields only, sizes limited, numbers
   * whole. Returns null when it isn't a build at all.
   */
  function cleanBuild(b) {
    if (!b || typeof b !== "object") return null;
    const growth = {};
    for (const g of ["Power", "Magic", "Sense", "Charm"]) growth[g] = clamp(b.growth && b.growth[g], 1, 4) || 1;
    const custom = (Array.isArray(b.custom) ? b.custom : []).slice(0, LIMITS.custom)
      .filter(c => c && /^c:[a-z0-9]{1,24}$/.test(c.id) && SLOT_KINDS.includes(c.s))
      .map(c => {
        const it = { id: c.id, n: str(c.n, LIMITS.name) || "Custom item", s: c.s, l: clamp(c.l, 0, 999), custom: true };
        const st = cleanStats(c.st), e = cleanStats(c.e, ELEMENTS), r = cleanStats(c.r, ELEMENTS);
        if (Object.keys(st).length) it.st = st;
        if (Object.keys(e).length) it.e = e;
        if (Object.keys(r).length) it.r = r;
        const note = str(c.note, 120);
        if (note) it.note = note;
        return it;
      });
    const customIds = new Set(custom.map(c => c.id));
    const gear = {};
    for (const s of SLOTS) {
      const g = b.gear && b.gear[s.key];
      if (!g || !g.id) continue;
      const id = str(g.id, 30);
      if (id.startsWith("c:") ? !customIds.has(id) : !/^\d{1,9}$/.test(id)) continue;
      const add = cleanStats(g.add);
      gear[s.key] = Object.keys(add).length ? { id, add } : { id };
    }
    const bonus = {};
    for (const k of STATS) { const v = clamp(b.bonus && b.bonus[k], 0, 100); if (v) bonus[k] = v; }
    const buffs = (Array.isArray(b.buffs) ? b.buffs : []).slice(0, LIMITS.buffs)
      .filter(x => x && (STATS.includes(x.stat) || ELEMENTS.includes(x.stat)))
      .map(x => ({ name: str(x.name, LIMITS.name) || "Buff", stat: x.stat, value: clamp(x.value, -99999, 99999), on: !!x.on }));
    return {
      id: /^b[a-z0-9]{1,24}$/.test(b.id) ? b.id : newId("b"),
      name: str(b.name, LIMITS.name) || "My build",
      cls: str(b.cls, 20), job: str(b.job, 40),
      level: clamp(b.level, 1, 999) || 1,
      growth, bonus, gear, custom, buffs,
      notes: str(b.notes, LIMITS.notes),
      updated: clamp(b.updated, 0, 9e15)
    };
  }

  /** Saved builds as they are synced: clean, at most 20, newest first. */
  function cleanBuilds(list) {
    const out = [], ids = new Set();
    for (const b of Array.isArray(list) ? list : []) {
      const c = cleanBuild(b);
      if (!c || ids.has(c.id)) continue;
      ids.add(c.id);
      out.push(c);
    }
    return out.sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id)).slice(0, LIMITS.builds);
  }

  /** Two lists of saved builds as one: the newer copy of the same build wins. */
  function mergeBuilds(a, b) {
    const by = new Map();
    for (const x of [...cleanBuilds(b), ...cleanBuilds(a)]) {
      const had = by.get(x.id);
      if (!had || x.updated >= had.updated) by.set(x.id, x);
    }
    return cleanBuilds([...by.values()]);
  }

  /** A share code for one build (custom items travel with it): "TCB1." + base64 JSON. */
  function encodeBuild(b) {
    const json = JSON.stringify(Object.assign({}, cleanBuild(b), { id: undefined, updated: undefined }));
    const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
    return "TCB1." + b64;
  }

  /** The build in a share code, as a new build (own id), or null when the code is broken. */
  function decodeBuild(code) {
    const m = /^TCB1\.([A-Za-z0-9+/=]+)$/.exec(String(code || "").replace(/\s+/g, ""));
    if (!m || m[1].length > 60000) return null;
    try {
      const json = typeof atob === "function" ? decodeURIComponent(escape(atob(m[1]))) : Buffer.from(m[1], "base64").toString("utf8");
      const b = cleanBuild(JSON.parse(json));
      if (!b) return null;
      b.id = newId("b");
      return b;
    } catch (e) { return null; }
  }

  const model = { STATS, ELEMENTS, SLOTS, SLOT_KINDS, LIMITS, cleanStats, indexCatalog, itemFor, totals, diff, search, cleanBuild, cleanBuilds, mergeBuilds, encodeBuild, decodeBuild, newId };

  if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

  // ---------------------------------------------------------------------------------------------
  // Renderer (browser). Handlers live on TQPlanner (set up in index.html).
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const jsq = s => esc(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const sign = v => (v > 0 ? "+" : "") + v.toLocaleString();
  const statLine = st => Object.entries(st || {}).map(([k, v]) => `<span class="pl-st">${k} <b>${sign(v)}</b></span>`).join("");
  const elemLine = (e, r) => [
    ...Object.entries(e || {}).map(([k, v]) => `<span class="pl-el pl-el-${k.toLowerCase()}">${k} ${v}</span>`),
    ...Object.entries(r || {}).map(([k, v]) => `<span class="pl-el pl-el-res">${k} res ${v}</span>`)
  ].join("");

  function itemImg(it, ctx) {
    const url = it && !it.custom && ctx.itemImage ? ctx.itemImage(it.n) : "";
    return url ? `<img src="${esc(url)}" alt="" loading="lazy">` : "";
  }

  function slotCard(s, build, ctx) {
    const g = (build.gear || {})[s.key];
    const it = g ? itemFor(g.id, build, ctx.byId) : null;
    const open = ctx.ui.slot === s.key;
    const adds = g && g.add ? Object.entries(g.add) : [];
    return `
      <li class="pl-slot ${it ? "is-on" : ""} ${open ? "is-open" : ""}">
        <button type="button" class="pl-slot-btn" onclick="TQPlanner.openSlot('${s.key}')" aria-expanded="${open}">
          <span class="pl-slot-icon" aria-hidden="true">${itemImg(it, ctx) || s.icon}</span>
          <span class="pl-slot-main">
            <span class="pl-slot-label">${s.label}</span>
            <span class="pl-slot-item">${it ? `${esc(it.n)} <span class="ep-lv">Lv.${it.l}</span>${it.custom ? ` <span class="tag">Custom</span>` : ""}` : g ? `<span class="bd-warn">Item ${esc(g.id)} not found</span>` : `<span class="bd-note">Empty</span>`}</span>
            ${it ? `<span class="pl-stats">${statLine(it.st)}${elemLine(it.e, it.r)}${adds.length ? `<span class="pl-st pl-add">${adds.map(([k, v]) => `${k} ${sign(v)}`).join(" · ")}</span>` : ""}</span>` : ""}
          </span>
        </button>
      </li>`;
  }

  /** The open slot: what's in it (bonuses typed in, remove) and the item list to pick from. */
  function slotPanel(build, ctx) {
    const s = SLOTS.find(x => x.key === ctx.ui.slot);
    if (!s) return "";
    const g = (build.gear || {})[s.key];
    const cur = g ? itemFor(g.id, build, ctx.byId) : null;
    const res = search(ctx.catalog, build, { slot: s.slot, query: ctx.ui.query, maxLevel: ctx.ui.fitLevel ? build.level : 0 });
    const adds = g && g.add ? Object.entries(g.add) : [];
    const statOpts = sel => STATS.map(k => `<option ${k === sel ? "selected" : ""}>${k}</option>`).join("");
    const rows = res.list.map(it => {
      const d = diff(cur, it);
      const on = cur && it.id === cur.id;
      return `<li><button type="button" class="pl-pick ${on ? "is-on" : ""}" onclick="TQPlanner.equip('${s.key}', '${jsq(it.id)}')">
          <span class="pl-pick-name">${itemImg(it, ctx)}<strong>${esc(it.n)}</strong> <span class="ep-lv">Lv.${it.l}</span>${it.custom ? ` <span class="tag">Custom</span>` : ""}${it.c ? ` <span class="tag" title="Compound slots">◇${it.c}</span>` : ""}</span>
          <span class="pl-stats">${statLine(it.st)}${elemLine(it.e, it.r)}</span>
          ${cur && !on ? `<span class="pl-diff">${Object.keys(d).length ? Object.entries(d).map(([k, v]) => `<span class="${v > 0 ? "is-up" : "is-down"}">${k} ${sign(v)}</span>`).join("") : `<span class="bd-note">same stats</span>`}</span>` : ""}
        </button></li>`;
    }).join("");
    return `
      <section class="bd-box pl-panel" aria-label="${s.label}">
        <div class="pl-panel-head">
          <h4>${s.icon} ${s.label}</h4>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.openSlot('')">Close</button>
        </div>
        ${cur ? `
          <div class="pl-cur">
            <p><strong>${esc(cur.n)}</strong> <span class="ep-lv">Lv.${cur.l}</span> ${cur.c ? `<span class="tag">◇ ${cur.c} compound slots</span>` : ""}
              <button type="button" class="btn btn-sm" onclick="TQPlanner.equip('${s.key}', '')">Take off</button></p>
            <p class="bd-note">Refine, Compound or random bonus on your piece: add what the game shows.</p>
            <ul class="pl-adds">${adds.map(([k, v]) => `<li><span>${k} <b>${sign(v)}</b></span><button type="button" class="btn btn-sm" aria-label="Remove ${k} bonus" onclick="TQPlanner.setAdd('${s.key}', '${k}', 0)">✕</button></li>`).join("")}</ul>
            ${adds.length < LIMITS.adds ? `<form class="pl-add-form" onsubmit="event.preventDefault(); TQPlanner.setAdd('${s.key}', this.stat.value, this.val.value, true)">
              <select name="stat" aria-label="Stat">${statOpts("AP")}</select>
              <input name="val" type="number" step="1" placeholder="+0" aria-label="Bonus value" required>
              <button type="submit" class="btn btn-sm">Add bonus</button>
            </form>` : ""}
          </div>` : ""}
        <div class="pl-search">
          <input type="search" id="plSearch" value="${esc(ctx.ui.query)}" placeholder="Search ${s.label.toLowerCase()}s by name" aria-label="Search items" oninput="TQPlanner.query(this.value)">
          <label class="pl-fit"><input type="checkbox" ${ctx.ui.fitLevel ? "checked" : ""} onchange="TQPlanner.fitLevel(this.checked)"> Lv.${build.level} and below</label>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.customForm('${s.slot}')">＋ Custom item</button>
        </div>
        ${ctx.ui.custom === s.slot ? customForm(s) : ""}
        ${!ctx.catalog ? `<p class="bd-note">Loading items…</p>` : res.list.length ? `<ul class="pl-picks">${rows}</ul>${res.more ? `<p class="bd-note">${res.more.toLocaleString()} more: type more of the name.</p>` : ""}` : `<p class="bd-note">No ${s.label.toLowerCase()} matches. Add it as a custom item.</p>`}
      </section>`;
  }

  function customForm(s) {
    return `
      <form class="pl-custom" onsubmit="event.preventDefault(); TQPlanner.addCustom(this, '${s.key}')">
        <p class="bd-note">An item that isn't in the list (new on the live server, or different there). It's saved with this build and goes along when you share it.</p>
        <label>Name <input name="n" maxlength="${LIMITS.name}" required></label>
        <label>Level <input name="l" type="number" min="0" max="999" value="1"></label>
        <div class="pl-custom-stats">${STATS.map(k => `<label>${k} <input name="st_${k}" type="number" step="1"></label>`).join("")}</div>
        <label>Note <input name="note" maxlength="120" placeholder="Where it's from, what you checked"></label>
        <button type="submit" class="btn btn-sm btn-primary">Add and wear</button>
      </form>`;
  }

  function statTable(build, t, ctx) {
    const lv = ctx.levelGain || {};
    const rows = STATS.map(k => {
      const gear = t.gear[k] || 0, add = t.adds[k] || 0, buff = t.buffs[k] || 0, plus = t.plus[k] || 0;
      return `<tr class="${plus ? "" : "is-zero"}"><th scope="row">${k}</th>
        <td>${lv[k] != null ? Math.floor(lv[k]).toLocaleString() : "–"}</td>
        <td>${gear ? sign(gear) : "–"}</td><td>${add ? sign(add) : "–"}</td><td>${buff ? sign(buff) : "–"}</td>
        <td><strong>${plus ? sign(plus) : "0"}</strong></td></tr>`;
    }).join("");
    const el = ELEMENTS.filter(k => t.elements[k] || t.resist[k]);
    return `
      <section class="bd-box">
        <h4>📊 Stats from gear</h4>
        <div class="bd-lvtable-wrap"><table class="bd-stats pl-totals">
          <thead><tr><th>Stat</th><th title="Gain from levels and bonus points (wiki formula, without starting stats)">Levels</th><th>Gear</th><th>Bonuses</th><th>Buffs</th><th title="Compare with the number after + in the game's status window">+ in game</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="bd-note">The last column is what the game shows after the <b>+</b> (like AP 1178<b>+4007</b>). "Levels" leaves out starting stats, so it won't match the first number yet.</p>
        ${el.length ? `<p class="pl-elems"><b>Elements:</b> ${el.map(k => `<span class="pl-el pl-el-${k.toLowerCase()}">${k}${t.elements[k] ? ` ${t.elements[k]}` : ""}${t.resist[k] ? ` · res ${t.resist[k]}` : ""}</span>`).join("")}</p>` : ""}
      </section>`;
  }

  function buffBox(build) {
    const opts = sel => [...STATS, ...ELEMENTS].map(k => `<option ${k === sel ? "selected" : ""}>${k}</option>`).join("");
    return `
      <details class="bd-box pl-buffs" ${build.buffs.length ? "open" : ""}>
        <summary><h4>✨ Buffs <span class="bd-note">${build.buffs.filter(b => b.on).length} on</span></h4></summary>
        <p class="bd-note">Type in what a buff adds (your own or a party member's). Ticked buffs count in the totals.</p>
        <ul class="pl-buff-list">${build.buffs.map((b, i) => `
          <li><input type="checkbox" ${b.on ? "checked" : ""} aria-label="Use ${esc(b.name)}" onchange="TQPlanner.buff(${i}, 'on', this.checked)">
            <input value="${esc(b.name)}" maxlength="${LIMITS.name}" aria-label="Buff name" onchange="TQPlanner.buff(${i}, 'name', this.value)">
            <select aria-label="Stat" onchange="TQPlanner.buff(${i}, 'stat', this.value)">${opts(b.stat)}</select>
            <input type="number" value="${b.value}" aria-label="Value" onchange="TQPlanner.buff(${i}, 'value', this.value)">
            <button type="button" class="btn btn-sm" aria-label="Remove ${esc(b.name)}" onclick="TQPlanner.buff(${i}, 'remove')">✕</button></li>`).join("")}</ul>
        ${build.buffs.length < LIMITS.buffs ? `<button type="button" class="btn btn-sm" onclick="TQPlanner.buff(-1, 'add')">＋ Add a buff</button>` : ""}
      </details>`;
  }

  function savedBox(build, ctx) {
    const saved = ctx.saved || [];
    const mine = saved.find(b => b.id === build.savedId);
    return `
      <section class="bd-box pl-saved">
        <h4>💾 Saved builds <span class="bd-note">${saved.length} / ${LIMITS.builds}${ctx.signedIn ? " · synced with your account" : " · on this device (sign in to sync)"}</span></h4>
        <div class="pl-save-row">
          <input id="plName" value="${esc(build.name || (mine && mine.name) || "")}" maxlength="${LIMITS.name}" placeholder="Build name, e.g. Primadonna AP 250" aria-label="Build name">
          ${mine ? `<button type="button" class="btn btn-sm btn-primary" onclick="TQPlanner.save(false)">Save changes</button>` : ""}
          <button type="button" class="btn btn-sm ${mine ? "" : "btn-primary"}" onclick="TQPlanner.save(true)" ${saved.length >= LIMITS.builds ? "disabled title='20 builds at most: delete one first'" : ""}>Save as new</button>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.share()">🔗 Share code</button>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.importCode()">📥 Open a code</button>
        </div>
        ${ctx.ui.code ? `<div class="pl-code"><textarea readonly rows="3" aria-label="Share code" onclick="this.select()">${esc(ctx.ui.code)}</textarea><p class="bd-note">Copy this and send it to a friend; they open it with 📥 Open a code.</p></div>` : ""}
        ${saved.length ? `<ul class="pl-saved-list">${saved.map(b => `
          <li class="${b.id === build.savedId ? "is-on" : ""}">
            <button type="button" class="pl-saved-open" onclick="TQPlanner.load('${b.id}')"><strong>${esc(b.name)}</strong>
              <span class="bd-note">${esc(b.job || b.cls)} · Lv.${b.level} · ${Object.keys(b.gear).length} pieces</span></button>
            <button type="button" class="btn btn-sm" aria-label="Delete ${esc(b.name)}" onclick="TQPlanner.remove('${b.id}')">🗑</button>
          </li>`).join("")}</ul>` : `<p class="bd-note">Nothing saved yet. Name this build and save it to come back to it or compare.</p>`}
      </section>`;
  }

  /**
   * ctx: { build (the guide's working build: cls, job, level, growth, bonus, gear, custom, buffs,
   *        name, savedId), catalog, byId, saved, signedIn, levelGain: {AP: n}, itemImage, ui: { slot,
   *        query, fitLevel, custom, code } }
   */
  function render(ctx) {
    const build = ctx.build;
    const t = totals(build, ctx.byId);
    return `
      ${savedBox(build, ctx)}
      <div class="pl-grid">
        <section class="bd-box pl-gear">
          <h4>🛡️ Equipment <span class="bd-note">${t.pieces.length} / ${SLOTS.length} · tap a slot to pick</span></h4>
          <ul class="pl-slots">${SLOTS.map(s => slotCard(s, build, ctx)).join("")}</ul>
        </section>
        <div class="pl-side">
          ${slotPanel(build, ctx)}
          ${statTable(build, t, ctx)}
          ${buffBox(build)}
        </div>
      </div>
      <p class="bd-note bd-source">Items: PlayTrickster client tables (base values of the old client). The live server may differ:
        if a number is wrong, type the difference as a bonus or add a custom item.${ctx.catalog && ctx.catalog.made ? ` Data ${esc(ctx.catalog.made)}.` : ""}</p>`;
  }

  root.TQPlanner = Object.assign({ render }, model);
})(typeof window !== "undefined" ? window : globalThis);

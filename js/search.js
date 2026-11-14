// Search everything: quests, items, monsters and NPCs. The index and matching are pure (Node:
// node scripts/test-search.js); render() returns HTML that calls jumpToQuest() / TQSearch.toggle().
(function (root) {
  "use strict";

  const MONSTER_RE = /([A-Z][A-Za-z0-9' .-]+?) \(Lv\.\s?(\d+)\)/g;
  const short = t => t.replace(/\s*(\([^)]*\)|\[[^\]]*\])\s*$/g, "").replace(/\s*(\([^)]*\)|\[[^\]]*\])\s*$/g, "");

  // "1x Oops Sticker", "Cycle 5: 2x Oops Shell + 1x Officer Tera Card", "5x 500 Galder Coupon" -> names
  function rewardNames(line) {
    return String(line).replace(/^Cycle \d+:\s*/, "").split(/\s*\+\s*|,\s*(?!\d{3}\b)/)
      .map(s => s.trim().replace(/^\d+x\s+/, "")).filter(Boolean);
  }

  /** Build the index once from the app's quests (legacy shape from js/data.js). */
  function buildIndex(quests) {
    const items = new Map(), monsters = new Map(), npcs = new Map(), list = [];
    const item = name => {
      if (!items.has(name)) items.set(name, { kind: "item", name, sources: [], usedBy: [], rewardFrom: [] });
      return items.get(name);
    };
    const monster = (name, level) => {
      if (!monsters.has(name)) monsters.set(name, { kind: "monster", name, level: level || 0, maps: [], drops: [], huntedIn: [] });
      const m = monsters.get(name);
      if (level && (!m.level || level < m.level)) m.level = level;
      return m;
    };
    const addUnique = (arr, v, key) => { if (!arr.some(x => (key ? x[key] === v[key] : x === v))) arr.push(v); };

    for (const q of quests) {
      const ref = { id: q.id, title: short(q.title), area: q.area };
      list.push({ kind: "quest", name: q.title, id: q.id, title: short(q.title), npc: q.npc, area: q.area });
      if (q.npc) {
        if (!npcs.has(q.npc)) npcs.set(q.npc, { kind: "npc", name: q.npc, quests: [], places: [] });
        const n = npcs.get(q.npc);
        n.quests.push(ref);
        addUnique(n.places, q.location);
      }
      for (const it of q.items || []) {
        const i = item(it.name);
        addUnique(i.usedBy, Object.assign({ qty: it.totalQty || it.qty }, ref), "id");
        if (it.method !== "Quest") addUnique(i.sources, { method: it.method, text: it.source, map: it.map }, "text");
        else addUnique(i.sources, { method: "Quest", text: it.source, map: it.map }, "text");
        if (it.method === "Drop") {
          for (const m of String(it.source).matchAll(MONSTER_RE)) {
            const mo = monster(m[1].replace(/^(or|and)\s+/i, "").trim(), +m[2]);
            addUnique(mo.drops, it.name);
            for (const mp of String(it.map || "").split(" / ")) if (mp) addUnique(mo.maps, mp);
          }
        }
      }
      for (const h of q.hunts || []) {
        const mo = monster(h.monster, h.level);
        addUnique(mo.huntedIn, Object.assign({ count: h.count }, ref), "id");
        for (const mp of String(h.map || "").split(" / ")) if (mp) addUnique(mo.maps, mp);
      }
      const rewards = (q.rewards && q.rewards.items) || [];
      for (const line of rewards) for (const name of rewardNames(line)) {
        if (/Galder (Coupon|Check)$|^Skill:/.test(name)) continue;
        addUnique(item(name).rewardFrom, ref, "id");
      }
    }
    return [...list, ...items.values(), ...monsters.values(), ...npcs.values()];
  }

  // 0 exact, 1 starts with, 2 a word starts with, 3 contains; -1 no match
  function score(name, q) {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(" " + q) || n.includes("-" + q) || n.includes("(" + q)) return 2;
    return n.includes(q) ? 3 : -1;
  }

  const LIMITS = { item: 8, monster: 6, npc: 6, quest: 10 };

  /** Matches grouped by kind: { item: [...], monster: [...], npc: [...], quest: [...] }, best first. */
  function search(index, text) {
    const q = String(text || "").trim().toLowerCase();
    const out = { item: [], monster: [], npc: [], quest: [] };
    if (q.length < 2) return out;
    const hits = [];
    for (const e of index) {
      let s = score(e.name, q);
      if (s < 0 && e.kind === "quest" && e.npc) { const t = score(e.npc, q); if (t >= 0) s = t + 4; }
      if (s >= 0) hits.push([s, e]);
    }
    hits.sort((a, b) => (a[0] - b[0]) || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
    for (const [, e] of hits) if (out[e.kind].length < LIMITS[e.kind]) out[e.kind].push(e);
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Render (browser)
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const link = r => `<button type="button" class="srch-qlink" onclick="TQSearch.close(); jumpToQuest('${r.id}')">${esc(r.title)}</button>`;
  const links = (arr, extra) => arr.slice(0, 12).map(r => link(r) + (extra ? extra(r) : "")).join(" · ") + (arr.length > 12 ? ` <span class="srch-more">+${arr.length - 12} more</span>` : "");
  const METHOD_ICON = { Drop: "⚔️", Drill: "⛏️", Shop: "🛒", Compound: "⚗️", Quest: "🔗" };
  let open = new Set();

  function render(results, ctx) {
    const sections = [];
    const head = (icon, label, n) => `<h3 class="srch-h">${icon} ${label} <span class="srch-n">${n}</span></h3>`;
    if (results.item.length) sections.push(head("🎒", "Items", results.item.length) + results.item.map(e => {
      const key = "item:" + e.name, isOpen = open.has(key);
      const img = ctx.itemImage ? ctx.itemImage(e.name) : null;
      const where = e.sources.slice(0, 3).map(s => `${METHOD_ICON[s.method] || "•"} ${esc(s.text)}${s.map && s.method !== "Quest" ? ` <span class="srch-map">@ ${esc(s.map)}</span>` : ""}`).join("<br>");
      return `<div class="srch-row ${isOpen ? "is-open" : ""}">
          <button type="button" class="srch-main" onclick="TQSearch.toggle('${esc(key).replace(/'/g, "\\'")}')" aria-expanded="${isOpen}">
            ${img ? `<img class="srch-icon" src="${esc(img)}" alt="" loading="lazy">` : `<span class="srch-icon">🎒</span>`}
            <span class="srch-name">${esc(e.name)}</span>
            <span class="srch-sub">${e.usedBy.length ? `used in ${e.usedBy.length} quest${e.usedBy.length === 1 ? "" : "s"}` : ""}${e.usedBy.length && e.rewardFrom.length ? " · " : ""}${e.rewardFrom.length ? `reward from ${e.rewardFrom.length}` : ""}</span>
          </button>
          ${isOpen ? `<div class="srch-detail">
            ${where ? `<div><b>Get it:</b><br>${where}</div>` : ""}
            ${e.rewardFrom.length ? `<div><b>🎁 Reward from:</b> ${links(e.rewardFrom)}</div>` : ""}
            ${e.usedBy.length ? `<div><b>📜 Used in:</b> ${links(e.usedBy, r => ` <span class="srch-more">×${r.qty}</span>`)}</div>` : ""}
          </div>` : ""}
        </div>`;
    }).join(""));
    if (results.monster.length) sections.push(head("⚔️", "Monsters", results.monster.length) + results.monster.map(e => {
      const key = "monster:" + e.name, isOpen = open.has(key);
      return `<div class="srch-row ${isOpen ? "is-open" : ""}">
          <button type="button" class="srch-main" onclick="TQSearch.toggle('${esc(key).replace(/'/g, "\\'")}')" aria-expanded="${isOpen}">
            <span class="srch-icon">⚔️</span>
            <span class="srch-name">${esc(e.name)}${e.level ? ` <span class="srch-lv">Lv.${e.level}</span>` : ""}</span>
            <span class="srch-sub">${e.maps.slice(0, 2).map(esc).join(" / ")}${e.maps.length > 2 ? " …" : ""}</span>
          </button>
          ${isOpen ? `<div class="srch-detail">
            ${e.maps.length ? `<div><b>📍 Found at:</b> ${e.maps.map(esc).join(" · ")}</div>` : ""}
            ${e.drops.length ? `<div><b>🎒 Drops (for quests):</b> ${e.drops.map(d => `<button type="button" class="srch-qlink" onclick="TQSearch.find('${esc(d).replace(/'/g, "\\'")}')">${esc(d)}</button>`).join(" · ")}</div>` : ""}
            ${e.huntedIn.length ? `<div><b>🎯 Hunt in:</b> ${links(e.huntedIn, r => ` <span class="srch-more">×${r.count}</span>`)}</div>` : ""}
          </div>` : ""}
        </div>`;
    }).join(""));
    if (results.npc.length) sections.push(head("🙋", "NPCs", results.npc.length) + results.npc.map(e => {
      const key = "npc:" + e.name, isOpen = open.has(key);
      const img = ctx.npcImage ? ctx.npcImage(e.name) : null;
      return `<div class="srch-row ${isOpen ? "is-open" : ""}">
          <button type="button" class="srch-main" onclick="TQSearch.toggle('${esc(key).replace(/'/g, "\\'")}')" aria-expanded="${isOpen}">
            ${img ? `<img class="srch-icon" src="${esc(img)}" alt="" loading="lazy">` : `<span class="srch-icon">🙋</span>`}
            <span class="srch-name">${esc(e.name)}</span>
            <span class="srch-sub">${e.quests.length} quest${e.quests.length === 1 ? "" : "s"} · ${esc(e.places[0] || "")}</span>
          </button>
          ${isOpen ? `<div class="srch-detail">
            <div><b>📍 Stands at:</b> ${e.places.map(esc).join(" · ")}</div>
            <div><b>📜 Quests:</b> ${links(e.quests)}</div>
          </div>` : ""}
        </div>`;
    }).join(""));
    if (results.quest.length) sections.push(head("📜", "Quests", results.quest.length) + results.quest.map(e => `
        <div class="srch-row">
          <button type="button" class="srch-main" onclick="TQSearch.close(); jumpToQuest('${e.id}')">
            <span class="srch-icon">📜</span>
            <span class="srch-name">${esc(e.title)}</span>
            <span class="srch-sub">${esc(e.npc || "")}${e.area ? " · " + esc(e.area) : ""}</span>
          </button>
        </div>`).join(""));
    return sections.join("") || "";
  }

  const api = { buildIndex, search, score, rewardNames };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---------------------------------------------------------------------------------------------
  // The search box (dialog): / anywhere, 🔍 in the header
  // ---------------------------------------------------------------------------------------------
  let index = null, ctx = null, last = "";
  function init(context) { ctx = context; }

  function openBox(text) {
    const dlg = document.getElementById("searchDialog");
    if (!dlg || !ctx) return;
    if (!index) index = buildIndex(ctx.quests());
    if (!dlg.open) dlg.showModal();
    const input = document.getElementById("searchBox");
    if (typeof text === "string") input.value = text;
    input.focus();
    input.select();
    update(input.value);
  }

  function close() {
    const dlg = document.getElementById("searchDialog");
    if (dlg && dlg.open) dlg.close();
  }

  function update(text) {
    last = text;
    const res = search(index, text);
    const n = res.item.length + res.monster.length + res.npc.length + res.quest.length;
    if (n === 1) { const only = res.item[0] || res.monster[0] || res.npc[0]; if (only) open.add(only.kind + ":" + only.name); }
    const box = document.getElementById("searchResults");
    box.innerHTML = String(text).trim().length < 2
      ? `<p class="srch-hint">Type an item, monster, NPC or quest name. Try <button type="button" class="srch-qlink" onclick="TQSearch.find('Golden Eyepatch')">Golden Eyepatch</button>, <button type="button" class="srch-qlink" onclick="TQSearch.find('Master Foe')">Master Foe</button> or <button type="button" class="srch-qlink" onclick="TQSearch.find('Skipper Min')">Skipper Min</button>.</p>`
      : n ? render(res, ctx) : `<p class="srch-hint">Nothing matches "${esc(text)}".</p>`;
  }

  function toggle(key) {
    if (open.has(key)) open.delete(key); else open.add(key);
    update(last);
  }

  function find(text) { open = new Set(); openBox(text); }

  // "/" opens the box (not while typing in a field); Esc closes it (the dialog does that itself)
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", e => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      openBox();
    });
  }

  root.TQSearch = Object.assign({ init, open: openBox, close, update, toggle, find }, api);
})(this);

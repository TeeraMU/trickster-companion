// Town / zone views on the Quests page: "⚔️ Monsters" (what to hunt and what each monster drops for
// the quests shown) next to the quest list and Items to collect. The model is pure and runs under
// Node (node scripts/test-town.js); it regroups the Items-to-collect list (js/episode.js farmList)
// by monster, so both views always agree.
(function (root) {
  "use strict";

  /**
   * farm: farmList(...) output, optionally after TQBag.applyHave (rows then carry got / left / done).
   * Returns [{ monster, level, maps: [..], locked, done, drops: [row], hunts: [row] }]: monsters you
   * can work on now first, then by level (low first), then name.
   */
  function monsterList(farm) {
    const byName = new Map();
    for (const g of farm.maps || []) {
      for (const r of g.rows) {
        if (r.kind !== "drop" && r.kind !== "hunt") continue;
        const name = r.kind === "drop" ? r.monster : r.item;
        if (!byName.has(name)) byName.set(name, { monster: name, level: "", maps: [], drops: [], hunts: [], locked: true });
        const m = byName.get(name);
        if (!m.level && r.level) m.level = String(r.level);
        if (g.map && !m.maps.includes(g.map)) m.maps.push(g.map);
        (r.kind === "drop" ? m.drops : m.hunts).push(r);
        if (!r.locked) m.locked = false;
      }
    }
    const lv = m => parseInt(m.level, 10) || 0;
    return [...byName.values()]
      .map(m => Object.assign(m, { done: m.drops.length > 0 && m.drops.every(r => r.done) && !m.hunts.length }))
      .sort((a, b) => (a.locked - b.locked) || (a.done - b.done) || (lv(a) - lv(b)) || a.monster.localeCompare(b.monster));
  }

  // ---------------------------------------------------------------------------------------
  // Renderer (browser)
  // ---------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shortTitle = t => String(t).replace(/^[^-]+ - /, "");

  function qty(r) {
    if (r.done) return `<span class="ep-have-all">✅ have all ${r.qty}</span>`;
    if (r.got) return `<span class="item-qty-badge">×${r.left}</span> <span class="ep-have">have ${r.got} of ${r.qty}</span>`;
    return `<span class="item-qty-badge">×${r.qty}</span>`;
  }

  function forQuests(r) {
    const names = r.quests.map(x => (x.earlier ? "↩ " : "") + shortTitle(x.title));
    return `<span class="tw-for" title="${esc(r.quests.map(x => x.title).join(" · "))}">for ${esc(names.join(" · "))}</span>`;
  }

  /**
   * opts: { switchHtml, hint, itemIcon(name) -> html, emptyText }
   */
  function renderMonsters(list, opts) {
    const cards = list.map(m => `
      <li class="tw-mon ${m.locked ? "is-locked" : ""} ${m.done ? "is-done" : ""}">
        <div class="tw-mon-head">
          <span class="item-icon ep-icon-fallback" aria-hidden="true">⚔️</span>
          <div>
            <strong>${esc(m.monster)}</strong>${m.level ? ` <span class="ep-lv">Lv.${esc(m.level)}</span>` : ""}
            ${m.locked ? ` <span class="ep-lock" title="Every quest that needs it is still locked">🔒</span>` : ""}
            ${m.done ? ` <span class="ep-have-all">✅ got everything</span>` : ""}
            <div class="tw-maps">📍 ${esc(m.maps.join(" · "))}</div>
          </div>
        </div>
        <ul class="tw-lines">
          ${m.hunts.map(r => `<li>⚔️ <strong>Hunt</strong> <span class="item-qty-badge">×${r.qty}</span>${r.how ? ` <span class="tw-for">${esc(r.how)}</span>` : ""} ${forQuests(r)}</li>`).join("")}
          ${m.drops.map(r => `<li class="${r.done ? "is-done" : ""}">${opts.itemIcon ? opts.itemIcon(r.item) : "🎁"} <strong>${esc(r.item)}</strong> ${qty(r)} ${forQuests(r)}</li>`).join("")}
        </ul>
      </li>`).join("");
    return `
      <div class="ep-panel ep-farm tw-monsters">
        <div class="ep-panel-head">
          <h3>⚔️ Monsters</h3>
          ${opts.switchHtml || ""}
        </div>
        ${opts.hint ? `<p class="ep-hint">${opts.hint}</p>` : ""}
        ${list.length ? `<ul class="tw-mon-list">${cards}</ul>` : `<p class="ep-hint">${opts.emptyText || "Nothing to hunt for the quests shown."}</p>`}
      </div>`;
  }

  const api = { monsterList, renderMonsters };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TQTown = api;
})(this);

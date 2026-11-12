// Bag: items the player already has (appState.inventory { itemName: count }).
// Model (pure, testable under Node) + the Bag page renderer and the small +/- stepper.
(function (root) {
  "use strict";

  /** How many of `item` quest q still needs (same per-run rule as the farm list and the card). */
  function itemNeed(it, q, state) {
    if (state.completedQuests[q.id]) return 0;
    const runsLeft = Math.max(0, q.cycles - (state.completedCycles[q.id] || 0));
    if (!runsLeft) return 0;
    return it.totalQty === it.qty * q.cycles ? it.qty * runsLeft : it.totalQty;
  }

  /**
   * Every item still needed by unfinished quests, with what the player has:
   * [{ item, need, have, left, spare, chain, quests: [{ id, title, need }] }]
   * sorted by how many quests use it (most first), then name. `chain` = only ever handed over
   * by other quests (nobody farms it, but selling it would still break the quest).
   */
  function bagList(quests, state, have) {
    const rows = new Map();
    for (const q of quests) {
      for (const it of q.items || []) {
        const need = itemNeed(it, q, state);
        if (!need) continue;
        if (!rows.has(it.name)) rows.set(it.name, { item: it.name, need: 0, quests: [], chain: true });
        const r = rows.get(it.name);
        r.need += need;
        if (it.method !== "Quest") r.chain = false;
        const existing = r.quests.find(x => x.id === q.id);
        if (existing) existing.need += need; else r.quests.push({ id: q.id, title: q.title, need });
      }
    }
    return [...rows.values()].map(r => {
      const h = Math.max(0, (have && have[r.item]) || 0);
      return Object.assign(r, { have: h, left: Math.max(0, r.need - h), spare: Math.max(0, h - r.need) });
    }).sort((a, b) => (b.quests.length - a.quests.length) || a.item.localeCompare(b.item));
  }

  /**
   * Take what the player has away from the farm list (TQEpisode.farmList output), row by row in
   * the order shown. Rows get { got, left, done }; nothing is mutated.
   */
  function applyHave(farm, have) {
    const pool = Object.assign({}, have || {});
    const take = r => {
      const got = Math.min(r.qty, Math.max(0, pool[r.item] || 0));
      if (r.kind !== "hunt") pool[r.item] = (pool[r.item] || 0) - got;
      const g = r.kind === "hunt" ? 0 : got;
      return Object.assign({}, r, { got: g, left: r.qty - g, done: r.qty - g <= 0 });
    };
    return {
      maps: farm.maps.map(m => Object.assign({}, m, { rows: m.rows.map(take) })),
      shop: farm.shop.map(take),
      compound: farm.compound.map(take)
    };
  }

  const model = { itemNeed, bagList, applyHave };

  // ---------------------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------------------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** − [n] + control. Handlers read the item from data-item (names can contain quotes). */
  function stepper(item, have) {
    return `<span class="bag-stepper" data-item="${esc(item)}">
      <button type="button" class="bag-step" aria-label="One less ${esc(item)}" onclick="stepHave(this, -1)">−</button>
      <input type="number" min="0" max="999" inputmode="numeric" class="bag-count" value="${have}" oninput="if (this.value.length > 3) this.value = this.value.slice(0, 3)" aria-label="How many ${esc(item)} you have" onchange="typeHave(this)" />
      <button type="button" class="bag-step" aria-label="One more ${esc(item)}" onclick="stepHave(this, 1)">+</button>
    </span>`;
  }

  function renderBag(container, ctx) {
    const all = bagList(ctx.quests, ctx.state, ctx.have);
    const search = (ctx.search || "").trim().toLowerCase();
    let rows = all;
    if (ctx.filter === "spare") rows = rows.filter(r => r.spare > 0);
    else if (ctx.filter === "missing") rows = rows.filter(r => r.left > 0 && !r.chain);
    if (search) rows = rows.filter(r => r.item.toLowerCase().includes(search) || r.quests.some(q => q.title.toLowerCase().includes(search)));
    // items you have that no unfinished quest needs any more: safe to sell
    const sellable = Object.entries(ctx.have || {}).filter(([k, v]) => v > 0 && !all.some(r => r.item === k));

    const keepCount = all.filter(r => !r.chain).length;
    const tabs = [["keep", `🔒 Keep (${all.length})`], ["missing", `🎯 Still missing (${all.filter(r => r.left > 0 && !r.chain).length})`], ["spare", `💰 Extra (${all.filter(r => r.spare > 0).length + sellable.length})`]];
    const list = rows.map(r => {
      const icon = ctx.getItemImage(r.item);
      const status = r.chain
        ? `<span class="bag-status is-chain">🔗 handed over by a quest</span>`
        : r.left > 0
          ? `<span class="bag-status is-missing">need ${r.left} more</span>`
          : r.spare > 0 ? `<span class="bag-status is-spare">✅ enough · ${r.spare} extra</span>` : `<span class="bag-status is-ok">✅ enough</span>`;
      return `
        <li class="bag-row ${r.left === 0 ? "is-enough" : ""}">
          ${icon ? `<img class="item-icon-lg" src="${esc(icon)}" alt="" loading="lazy" />` : `<span class="item-icon-lg ep-icon-fallback">🎁</span>`}
          <div class="bag-main">
            <div class="bag-name"><strong>${esc(r.item)}</strong> <span class="bag-lock" title="Still needed: don't sell">🔒</span> ${status}</div>
            <div class="bag-need">Needed: <strong>${r.need}</strong> · for ${r.quests.length} quest${r.quests.length === 1 ? "" : "s"}:
              ${r.quests.slice(0, 4).map(q => `<span class="bag-quest">${esc(q.title.replace(/\s*\([^)]*\)\s*$/, ""))} ×${q.need}</span>`).join("")}${r.quests.length > 4 ? ` <span class="bag-more">+${r.quests.length - 4} more</span>` : ""}</div>
          </div>
          ${stepper(r.item, r.have)}
        </li>`;
    }).join("");
    const sell = ctx.filter === "spare" && sellable.length ? `
      <h4 class="bag-h">💰 Not needed by any quest left: OK to sell</h4>
      <ul class="bag-list">${sellable.map(([k, v]) => `
        <li class="bag-row is-enough"><span class="item-icon-lg ep-icon-fallback">💰</span>
          <div class="bag-main"><div class="bag-name"><strong>${esc(k)}</strong> <span class="bag-status is-spare">${v} in bag</span></div></div>
          ${stepper(k, v)}</li>`).join("")}</ul>` : "";

    container.innerHTML = `
      <div class="ep-panel bag-panel">
        <div class="ep-panel-head">
          <h3>🎒 Bag</h3>
          <input type="text" class="bag-search" placeholder="🔍 Find an item or quest" value="${esc(ctx.search || "")}" oninput="setBagSearch(this.value)" />
        </div>
        <p class="ep-hint">Type how many you have of each item. Everything here is still needed by a quest you haven't finished (${keepCount} to farm, ${all.length - keepCount} handed over by quests): <strong>don't sell these</strong>. The Episodes and Quests pages subtract what you have.</p>
        <div class="bag-tabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" role="tab" class="pill-btn ${ctx.filter === k ? "active" : ""}" aria-selected="${ctx.filter === k}" onclick="setBagFilter('${k}')">${label}</button>`).join("")}</div>
        ${rows.length ? `<ul class="bag-list">${list}</ul>` : `<div class="ep-empty">${ctx.filter === "missing" ? "✅ You have everything for the quests left!" : ctx.filter === "spare" ? "Nothing extra yet." : "Nothing found."}</div>`}
        ${sell}
      </div>`;
  }

  root.TQBag = Object.assign({ render: renderBag, stepper }, model);
})(typeof window !== "undefined" ? window : globalThis);

// Episode view: model (pure functions, testable under Node) + renderer (browser only).
// Model input: quests in the legacy shape from js/data.js and the saved progress
// { completedQuests, completedCycles }.
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------------------

  /** Episodes in play order: [{ key: "Episode 0", short: "EP0", quests, chapters: [{ name, quests }] }] */
  function listEpisodes(quests) {
    const eps = new Map();
    for (const q of quests) {
      if (!/^Episode \d+$/.test(q.region)) continue;
      if (!eps.has(q.region)) eps.set(q.region, []);
      eps.get(q.region).push(q);
    }
    return [...eps.entries()].map(([key, qs]) => {
      const chapters = new Map();
      for (const q of qs) {
        if (!chapters.has(q.subRegion)) chapters.set(q.subRegion, []);
        chapters.get(q.subRegion).push(q);
      }
      return {
        key,
        short: "EP" + key.split(" ")[1],
        quests: qs,
        chapters: [...chapters.entries()].map(([name, cq]) => ({ name, quests: cq }))
      };
    });
  }

  /** "Episode 1 - Ch.2: Unknown Ancient Box (Lv.50+)" -> { label: "Ch.2", title: "Unknown Ancient Box", level: "Lv.50+" } */
  function parseChapterName(name) {
    const m = name.match(/Ch\.\s*(\d+)\s*:\s*(.*)$/);
    if (!m) return { label: "", title: name, level: "" };
    let title = m[2].trim(), level = "";
    const lv = title.match(/\((Lv\.[^)]*)\)\s*$/);
    if (lv) { level = lv[1]; title = title.slice(0, lv.index).trim(); }
    return { label: "Ch." + m[1], title, level };
  }

  /**
   * Status of every quest: "done" | "available" | "locked".
   * A quest is locked while a prerequisite it needs *finished* is not done, or a prerequisite it
   * only needs *accepted* ("active") is itself still locked. Levels never lock a quest (gear matters
   * more than level in this game); the level is shown as a hint instead.
   */
  function questStatuses(allQuests, state, prereqsById) {
    const byId = new Map(allQuests.map(q => [q.id, q]));
    const memo = new Map();
    const isDone = id => !!state.completedQuests[id];
    function status(id, seen) {
      if (memo.has(id)) return memo.get(id);
      if (isDone(id)) { memo.set(id, "done"); return "done"; }
      if (seen.has(id)) return "available"; // defensive: validate.js rejects loops
      seen.add(id);
      let locked = false;
      for (const p of prereqsById[id] || []) {
        if (!byId.has(p.quest)) continue;
        if (p.active ? status(p.quest, seen) === "locked" : !isDone(p.quest)) { locked = true; break; }
      }
      const s = locked ? "locked" : "available";
      memo.set(id, s);
      return s;
    }
    const out = {};
    for (const q of allQuests) out[q.id] = status(q.id, new Set());
    return out;
  }

  function remainingCycles(q, state) {
    if (state.completedQuests[q.id]) return 0;
    return Math.max(0, q.cycles - (state.completedCycles[q.id] || 0));
  }

  /** Split a drop source like "Forest Wasp (Lv.47) - for Ginseng Tea" into monster + level. */
  function parseMonster(source) {
    const m = source.match(/^(.+?)\s*\(Lv\.?\s*([\d~\-+]+)\)/);
    if (m && !/drill/i.test(m[1])) return { monster: m[1].trim(), level: m[2] };
    return null;
  }

  /**
   * "Drill Depth 10~20m (Land) - for Ginseng Tea" -> "10~20m Land"
   * "Winter Season Only: Drill Depth 10m (Sand)"   -> "10m Sand (Winter only)"
   * Anything else ("Opened from Harkon Heirloom (Drilled 60~80m ...)") -> null
   */
  function parseDrill(source) {
    const m = source.match(/^(?:(\w+) Season Only:\s*)?Drill Depth\s*(\d+(?:\s*~\s*\d+)?\s*m)\s*(?:\((\w+)\))?/i);
    if (!m) return null;
    return m[2].replace(/\s+/g, "") + (m[3] ? " " + m[3] : "") + (m[1] ? " (" + m[1] + " only)" : "");
  }

  /**
   * Items still to collect for the given quests, grouped by map.
   * Quest-chain items (rewards of earlier quests) are left out: nobody farms them.
   * Returns { maps: [{ map, minOrder, locked, rows: [{ kind, item, qty, how, quests, locked }] }],
   *           shop: [...rows], compound: [...rows] }
   */
  function farmList(quests, state, statuses) {
    const maps = new Map();
    const shop = new Map();
    const compound = new Map();
    const add = (bucket, key, base, qty, q) => {
      if (!bucket.has(key)) bucket.set(key, Object.assign({ qty: 0, quests: [], locked: true }, base));
      const row = bucket.get(key);
      row.qty += qty;
      if (!row.quests.some(x => x.id === q.id)) row.quests.push({ id: q.id, title: q.title });
      if (statuses[q.id] !== "locked") row.locked = false;
    };
    const mapGroup = (name, q) => {
      if (!maps.has(name)) maps.set(name, { map: name, minOrder: q.order, rows: new Map() });
      const g = maps.get(name);
      g.minOrder = Math.min(g.minOrder, q.order);
      return g.rows;
    };

    for (const q of quests) {
      const cycles = remainingCycles(q, state);
      if (!cycles) continue;
      for (const it of q.items || []) {
        // most items are needed every run; a few quests (Card Girl) list one total for all runs
        const qty = it.totalQty === it.qty * q.cycles ? it.qty * cycles : it.totalQty;
        if (it.method === "Quest") continue;
        if (it.method === "Shop") { add(shop, it.name, { kind: "shop", item: it.name, how: it.map }, qty, q); continue; }
        if (it.method === "Compound") { add(compound, it.name, { kind: "compound", item: it.name, how: it.source, where: it.map }, qty, q); continue; }
        const rows = mapGroup(it.map, q);
        if (it.method === "Drop") {
          const mon = parseMonster(it.source);
          if (mon) { add(rows, "drop|" + mon.monster + "|" + it.name, { kind: "drop", item: it.name, monster: mon.monster, level: mon.level }, qty, q); continue; }
          add(rows, "other|" + it.name, { kind: "other", item: it.name, how: it.source }, qty, q);
          continue;
        }
        // Drill
        const depth = parseDrill(it.source);
        if (depth) add(rows, "drill|" + depth + "|" + it.name, { kind: "drill", item: it.name, depth }, qty, q);
        else add(rows, "other|" + it.name, { kind: "other", item: it.name, how: it.source }, qty, q);
      }
      for (const h of q.hunts || []) {
        const rows = mapGroup(h.map, q);
        add(rows, "hunt|" + h.monster, { kind: "hunt", item: h.monster, level: String(h.level), how: h.timeLimit ? "within " + h.timeLimit : "" }, h.count * cycles, q);
      }
    }

    const KIND_ORDER = { hunt: 0, drop: 1, drill: 2, other: 3 };
    const mapList = [...maps.values()].map(g => {
      const rows = [...g.rows.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
      return { map: g.map, minOrder: g.minOrder, rows, locked: rows.every(r => r.locked) };
    }).sort((a, b) => (a.locked - b.locked) || (a.minOrder - b.minOrder));

    return { maps: mapList, shop: [...shop.values()], compound: [...compound.values()] };
  }

  /** Everything the Episode view needs for one episode. */
  function episodeModel(ep, allQuests, state, prereqsById, scope) {
    const statuses = questStatuses(allQuests, state, prereqsById);
    const chapters = ep.chapters.map(ch => {
      const done = ch.quests.filter(q => statuses[q.id] === "done").length;
      return Object.assign({ name: ch.name, quests: ch.quests, done, total: ch.quests.length }, parseChapterName(ch.name));
    });
    const available = ep.quests.filter(q => statuses[q.id] === "available").sort((a, b) => a.order - b.order);
    const current = available[0] || null;
    const currentChapter = current ? chapters.find(c => c.quests.includes(current)) :
      chapters.find(c => c.done < c.total) || null;

    const sum = (qs, f) => qs.reduce((n, q) => n + f(q), 0);
    const expTotal = sum(ep.quests, q => (q.rewards.baseExp || 0) * q.cycles);
    const expLeft = sum(ep.quests, q => (q.rewards.baseExp || 0) * remainingCycles(q, state));

    const scopeQuests = scope === "chapter" && currentChapter ? currentChapter.quests : ep.quests;
    return {
      ep, chapters, statuses, current, currentChapter,
      done: ep.quests.filter(q => statuses[q.id] === "done").length,
      total: ep.quests.length,
      expTotal, expLeft,
      scopeQuests: scopeQuests.slice().sort((a, b) => a.order - b.order),
      farm: farmList(scopeQuests, state, statuses)
    };
  }

  const model = { listEpisodes, parseChapterName, questStatuses, parseMonster, parseDrill, farmList, episodeModel, remainingCycles };

  // ---------------------------------------------------------------------------------------
  // Renderer (browser)
  // ---------------------------------------------------------------------------------------

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : n.toLocaleString();

  function itemIcon(name, cls) {
    const url = root.getItemImage ? root.getItemImage(name) : "";
    return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" />` : `<span class="${cls} ep-icon-fallback">🎁</span>`;
  }

  const KIND_LABEL = { hunt: "⚔️ Hunt", drop: "⚔️ Drop", drill: "⛏️ Drill", other: "📦 Get" };

  /** Amount still to get: "×5", or with items in the bag "×3 (have 2 of 5)" / "✅ have all 5". */
  function qtyHtml(r) {
    if (r.done) return `<span class="ep-have-all">✅ have all ${r.qty}</span>`;
    if (r.got) return `<span class="item-qty-badge">×${r.left}</span> <span class="ep-have">have ${r.got} of ${r.qty}</span>`;
    return `<span class="item-qty-badge">×${r.qty}</span>`;
  }

  /** Bag stepper for item rows (not hunts) when the page passes the bag. */
  function haveStepper(r, have) {
    if (!have || r.kind === "hunt" || !root.TQBag) return "";
    return root.TQBag.stepper(r.item, have[r.item] || 0);
  }

  function farmRow(r, have) {
    const usedIn = r.quests.map(x => x.title).join(" · ");
    let how = "";
    if (r.kind === "drop") how = `${esc(r.monster)} <span class="ep-lv">Lv.${esc(r.level)}</span>`;
    else if (r.kind === "hunt") how = `<span class="ep-lv">Lv.${esc(r.level)}</span> ${esc(r.how)}`;
    else if (r.kind === "drill") how = esc(r.depth);
    else how = esc(r.how);
    return `
      <li class="ep-farm-row ${r.locked ? "is-locked" : ""} ${r.done ? "is-done" : ""}" title="Used in: ${esc(usedIn)}">
        ${r.kind === "hunt" ? `<span class="item-icon ep-icon-fallback">⚔️</span>` : itemIcon(r.item, "item-icon")}
        <div class="ep-farm-main">
          <div><strong>${esc(r.item)}</strong> ${qtyHtml(r)}${r.locked ? ` <span class="ep-lock" title="Every quest that needs this is still locked">🔒</span>` : ""}</div>
          <div class="ep-farm-how"><span class="ep-kind ep-kind-${r.kind}">${KIND_LABEL[r.kind]}</span> ${how}</div>
        </div>
        ${haveStepper(r, have)}
      </li>`;
  }

  /**
   * "Items to collect" panel, shared by the Episodes page and the Quest Checklist.
   * opts: { switchHtml, hint, afterHint (html under the hint), emptyText, lockedLabel }
   */
  function renderFarmPanel(f, opts) {
    const have = opts.have || null;
    if (have && root.TQBag) f = root.TQBag.applyHave(f, have);
    const empty = !f.maps.length && !f.shop.length && !f.compound.length;
    const maps = f.maps.map(g => `
      <section class="ep-map ${g.locked ? "is-locked" : ""} ${g.rows.every(r => r.done) ? "is-done" : ""}">
        <h4>🗺️ ${esc(g.map)} ${g.locked ? `<span class="ep-lock">🔒 later</span>` : ""}${g.rows.every(r => r.done) ? ` <span class="ep-have-all">✅ got everything</span>` : ""}</h4>
        <ul class="ep-farm-list">${g.rows.map(r => farmRow(r, have)).join("")}</ul>
      </section>`).join("");
    const shop = f.shop.length ? `
      <section class="ep-map">
        <h4>🛒 Buy</h4>
        <ul class="ep-farm-list">${f.shop.map(r => `
          <li class="ep-farm-row ${r.locked ? "is-locked" : ""} ${r.done ? "is-done" : ""}" title="Used in: ${esc(r.quests.map(x => x.title).join(" · "))}">
            ${itemIcon(r.item, "item-icon")}
            <div class="ep-farm-main"><div><strong>${esc(r.item)}</strong> ${qtyHtml(r)}</div>
            <div class="ep-farm-how">${esc(r.how)}</div></div>
            ${haveStepper(r, have)}
          </li>`).join("")}</ul>
      </section>` : "";
    const compound = f.compound.length ? `
      <section class="ep-map">
        <h4>⚗️ Combine (after collecting the ingredients)</h4>
        <ul class="ep-farm-list">${f.compound.map(r => `
          <li class="ep-farm-row ${r.locked ? "is-locked" : ""} ${r.done ? "is-done" : ""}">
            ${itemIcon(r.item, "item-icon")}
            <div class="ep-farm-main"><div><strong>${esc(r.item)}</strong> ${qtyHtml(r)}</div>
            <div class="ep-farm-how">${esc(r.how)} · ${esc(r.where)}</div></div>
            ${haveStepper(r, have)}
          </li>`).join("")}</ul>
      </section>` : "";
    return `
      <div class="ep-panel ep-farm" data-pane="farm">
        <div class="ep-panel-head">
          <h3>🎒 Items to collect</h3>
          ${opts.switchHtml || ""}
        </div>
        <p class="ep-hint">${opts.hint}</p>
        ${opts.afterHint || ""}
        ${empty ? `<div class="ep-empty">${opts.emptyText || "✅ Nothing left to farm here!"}</div>` : maps + shop + compound}
      </div>`;
  }

  function renderFarm(m, scope, have) {
    const scopeName = scope === "chapter" && m.currentChapter ? `${m.currentChapter.label} ${m.currentChapter.title}` : `all of ${m.ep.key}`;
    return renderFarmPanel(m.farm, {
      have,
      switchHtml: `
          <div class="pref-switch" role="group" aria-label="Item list scope">
            <button type="button" aria-pressed="${scope !== "chapter"}" onclick="setEpisodeScope('episode')">Whole EP</button>
            <button type="button" aria-pressed="${scope === "chapter"}" onclick="setEpisodeScope('chapter')">This chapter</button>
          </div>`,
      hint: `What's left for ${esc(scopeName)}, grouped by map. Items handed over by earlier quests aren't listed.`
    });
  }

  function lockedRow(q, prereqsById, byId, statuses) {
    const needs = (prereqsById[q.id] || [])
      .filter(p => byId.has(p.quest) && statuses[p.quest] !== "done")
      .map(p => byId.get(p.quest).title.replace(/\s*\([^)]*\)\s*$/, ""));
    return `
      <li class="ep-locked-row">
        <span class="ep-lock">🔒</span>
        <span class="quest-order">#${q.order}</span>
        <span class="ep-locked-title">${esc(q.title)}</span>
        <span class="ep-locked-meta">📍 ${esc(q.location)}${needs.length ? ` · needs ${esc(needs.join(", "))}` : ""}</span>
      </li>`;
  }

  function renderChapters(m, ctx, byId) {
    const prereqsById = ctx.prereqsById, openChapters = ctx.openChapters;
    return m.chapters.map(ch => {
      const isCurrent = ch === m.currentChapter;
      const open = openChapters[ch.name] !== undefined ? openChapters[ch.name] : isCurrent;
      const done = ch.quests.filter(q => m.statuses[q.id] === "done");
      const avail = ch.quests.filter(q => m.statuses[q.id] === "available");
      const locked = ch.quests.filter(q => m.statuses[q.id] === "locked");
      const pct = Math.round(ch.done / ch.total * 100);
      const cards = avail.map(q => {
        let html = ctx.renderCard(q);
        if (q === m.current) {
          html = html.replace('class="quest-card ', 'class="quest-card is-now ' + (ctx.expanded[q.id] === false ? "" : "expanded "));
          html = html.replace('<span class="quest-order">', '<span class="ep-now-badge">▶ Now</span><span class="quest-order">');
        }
        return html;
      }).join("");
      return `
        <details class="ep-chapter ${isCurrent ? "is-current" : ""}" ${open ? "open" : ""} ontoggle="rememberChapterOpen(this, ${esc(JSON.stringify(ch.name))})">
          <summary>
            <span class="ep-ch-label">${esc(ch.label)}</span>
            <span class="ep-ch-title">${esc(ch.title)}</span>
            ${ch.level ? `<span class="tag tag-level">${esc(ch.level)}</span>` : ""}
            <span class="ep-ch-progress"><span class="progress-track"><span class="progress-fill" style="width:${pct}%"></span></span>${ch.done}/${ch.total}</span>
          </summary>
          <div class="ep-chapter-body">
            ${done.length ? `
              <details class="ep-done">
                <summary>✅ ${done.length} done</summary>
                <div class="quest-list">${done.map(q => ctx.renderCard(q)).join("")}</div>
              </details>` : ""}
            ${avail.length ? `<div class="quest-list">${cards}</div>` : ""}
            ${locked.length ? `<ul class="ep-locked">${locked.map(q => lockedRow(q, prereqsById, byId, m.statuses)).join("")}</ul>` : ""}
            ${!avail.length && !locked.length ? `<div class="ep-empty">🎉 Chapter complete!</div>` : ""}
          </div>
        </details>`;
    }).join("");
  }

  function renderOverview(m, episodes, selectedKey) {
    const pct = Math.round(m.done / m.total * 100);
    const picker = episodes.map(e => `
      <button class="pill-btn ${e.key === selectedKey ? "active" : ""}" onclick="setEpisode('${esc(e.key)}')">${esc(e.short)}</button>`).join("");
    const soon = [2, 3, 4, 5, 6].filter(n => !episodes.some(e => e.key === "Episode " + n))
      .map(n => `<button class="pill-btn" disabled title="Coming soon">EP${n} soon</button>`).join("");
    const now = m.current
      ? `<div class="ep-now">▶ <strong>Next:</strong> ${esc(m.current.title)} <span class="ep-now-where">📍 ${esc(m.current.location)}</span></div>`
      : m.done === m.total ? `<div class="ep-now">🎉 <strong>${esc(m.ep.key)} complete!</strong></div>` : "";
    return `
      <div class="ep-panel ep-overview">
        <div class="ep-picker">${picker}${soon}</div>
        <div class="ep-overview-main">
          <h2>📖 ${esc(m.ep.key)}</h2>
          <div class="ep-overview-stats">
            <span><strong>${m.done}/${m.total}</strong> quests</span>
            <span>⭐ <strong>${fmt(m.expTotal - m.expLeft)}</strong> / ${fmt(m.expTotal)} EXP</span>
          </div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <ul class="ep-chapter-dots">
          ${m.chapters.map(ch => `
            <li class="${ch === m.currentChapter ? "is-current" : ""}">
              <span class="ep-ch-label">${esc(ch.label)}</span> ${esc(ch.title)}
              <span class="ep-dots" aria-label="${ch.done} of ${ch.total} done">${"●".repeat(ch.done)}<span class="ep-dots-left">${"○".repeat(ch.total - ch.done)}</span></span>
            </li>`).join("")}
        </ul>
        ${now}
      </div>`;
  }

  function renderEpisodeView(container, ctx) {
    const episodes = listEpisodes(ctx.quests);
    if (!episodes.length) { container.innerHTML = ""; return; }
    const ep = episodes.find(e => e.key === ctx.selected) || episodes[0];
    const m = episodeModel(ep, ctx.allQuests, ctx.state, ctx.prereqsById, ctx.scope);
    const byId = new Map(ctx.allQuests.map(q => [q.id, q]));
    const pane = ["quests", "route", "farm"].includes(ctx.pane) ? ctx.pane : "quests";
    container.innerHTML = `
      ${renderOverview(m, episodes, ep.key)}
      <div class="ep-subtabs" role="tablist">
        <button type="button" role="tab" aria-selected="${pane === "quests"}" onclick="setEpisodePane('quests')">📜 Quests</button>
        <button type="button" role="tab" aria-selected="${pane === "route"}" onclick="setEpisodePane('route')">🗺️ Route</button>
        <button type="button" role="tab" aria-selected="${pane === "farm"}" onclick="setEpisodePane('farm')">🎒 Items</button>
      </div>
      <div class="ep-layout ep-layout-3" data-pane="${pane}">
        <div class="ep-panel ep-quests" data-pane="quests">${renderChapters(m, ctx, byId)}</div>
        <div class="ep-side">
          ${ctx.renderRoute ? ctx.renderRoute(m) : ""}
          ${renderFarm(m, ctx.scope, ctx.have)}
        </div>
      </div>`;
    return m;
  }

  root.TQEpisode = Object.assign({ render: renderEpisodeView, renderFarmPanel }, model);
})(typeof window !== "undefined" ? window : globalThis);

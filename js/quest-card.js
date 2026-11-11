// Quest card: helpers (pure, testable under Node) + renderer (browser).
// The card keeps the ids / handlers the rest of the app relies on:
//   #qcard-<id>, toggleExpandQuest, toggleQuestComplete, setCycleCount, toggleStep,
//   and the 'class="quest-card ' / '<span class="quest-order">' strings js/episode.js decorates.
(function (root) {
  "use strict";

  const shortTitle = t => t.replace(/\s*(\([^)]*\)|\[[^\]]*\])\s*$/g, "").replace(/\s*(\([^)]*\)|\[[^\]]*\])\s*$/g, "").trim();

  /**
   * Counts for one collect objective given the player's progress.
   * Most items need `qty` per run; a few quests (card quests) list a different total for the whole
   * quest, so the per-run number is only meaningful when total == qty * cycles.
   */
  function itemCounts(item, q, state) {
    const doneRuns = state.completedQuests[q.id] ? q.cycles : Math.min(q.cycles, state.completedCycles[q.id] || 0);
    const perRun = item.totalQty === item.qty * q.cycles;
    const left = state.completedQuests[q.id] ? 0 : perRun ? item.qty * (q.cycles - doneRuns) : item.totalQty;
    return { perRun: item.qty, total: item.totalQty, left, showPerRun: perRun && q.cycles > 1 };
  }

  /** Warnings worth a badge: "Must be in-game DAYTIME!", "1x Super Alarm Clock in inventory". Class-only notes are shown as a class tag already. */
  function questWarnings(q) {
    const out = [];
    const text = q.prereq || "";
    for (const m of text.matchAll(/\(([^)]*)\)/g)) {
      const w = m[1].trim();
      if (/class only/i.test(w) || /^\d+ cycles?$/i.test(w) || /^(quest|quests) \d/i.test(w)) continue;
      if (/must|only|day|night|bring|inventory/i.test(w)) out.push(w.replace(/!+$/, ""));
    }
    const inv = text.match(/\+\s*([^,+()]*in inventory)/i);
    if (inv && !out.some(w => w.includes(inv[1].trim()))) out.push("Have " + inv[1].trim());
    return out;
  }

  /**
   * For an item handed over by another quest, find the quest that gives it: the closest earlier
   * quest whose rewards list the item ("1x Weird Piece 1"). Falls back to a quest title named in
   * the source text ("Reward from Guide Sabrina - Sabrina's Sacred Water").
   */
  function chainSource(item, quests, forQuest) {
    // Only "Reward from <one quest>" names a single giver. Texts like "1x from each of the 8 NPCs",
    // "Complete any 10 of 13 ..." or "Obtained from Quests / Monster Guilds" are shown as written.
    if (item.method !== "Quest" || !/^Reward from /i.test(item.source)) return null;
    let best = null;
    for (const o of quests) {
      if (o === forQuest) continue;
      for (const st of shortTitle(o.title).split(" & ")) {
        if (st.length > 6 && item.source.includes(st) && (!best || st.length > best.len)) best = { q: o, len: st.length };
      }
    }
    if (best) return best.q;
    const name = item.name.toLowerCase();
    const gives = o => (o.rewards.items || []).some(r => r.replace(/^\d+(~\d+)?x\s+/i, "").toLowerCase().startsWith(name));
    const givers = quests.filter(o => o !== forQuest && o.order <= forQuest.order && gives(o));
    return givers.reduce((b, o) => (!b || o.order > b.order ? o : b), null);
  }

  /** Short "how to get it" for a collect objective: { icon, kind, text, map } */
  function howToGet(item, parse) {
    switch (item.method) {
      case "Drop": {
        const mon = parse.parseMonster(item.source);
        return mon
          ? { icon: "⚔️", kind: "drop", text: `${mon.monster} · Lv.${mon.level}`, map: item.map }
          : { icon: "⚔️", kind: "drop", text: item.source, map: item.map };
      }
      case "Drill": {
        const depth = parse.parseDrill(item.source);
        return depth
          ? { icon: "⛏️", kind: "drill", text: `Drill ${depth}`, map: item.map }
          : { icon: "📦", kind: "other", text: item.source, map: item.map };
      }
      case "Shop": return { icon: "🛒", kind: "shop", text: item.source, map: item.map };
      case "Compound": return { icon: "⚗️", kind: "compound", text: item.source, map: item.map };
      default: return { icon: "🔗", kind: "quest", text: item.source, map: item.map };
    }
  }

  const helpers = { itemCounts, questWarnings, chainSource, howToGet, shortTitle };

  // ---------------------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------------------
  // tag text for each category (data labels -> what players call them)
  const CATEGORY_NAME = { Episode: "Story", Everyday: "Daily", General: "Town", Card: "Card Girl" };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = n => Number(n).toLocaleString();

  function iconImg(url, cls, fallback) {
    return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" />` : `<span class="${cls} qc-icon-fallback" aria-hidden="true">${fallback}</span>`;
  }

  function objectiveRow(item, q, ctx) {
    const c = itemCounts(item, q, ctx.state);
    const how = howToGet(item, ctx.parse);
    const done = c.left === 0;
    let source;
    if (how.kind === "quest") {
      const from = chainSource(item, ctx.quests, q);
      const got = from && ctx.state.completedQuests[from.id];
      source = from
        ? `🔗 from <em>${esc(shortTitle(from.title))}</em> ${got ? `<span class="qc-got">✓ got it</span>` : ""}`
        : `🔗 ${esc(how.text)}`;
    } else {
      source = `<span class="qc-how qc-how-${how.kind}">${how.icon} ${esc(how.text)}</span>${how.map ? ` <span class="qc-map">@ ${esc(how.map)}</span>` : ""}`;
    }
    const qtyHtml = c.showPerRun
      ? `<span class="item-qty-badge" title="Per run">×${c.perRun}</span> <span class="qc-qty-note">per run · ${c.total} total · <strong>${c.left} left</strong></span>`
      : `<span class="item-qty-badge">×${c.total}</span>${q.cycles > 1 && !done ? ` <span class="qc-qty-note"><strong>${c.left} left</strong></span>` : ""}`;
    return `
      <li class="qc-obj ${done ? "is-done" : ""}">
        ${iconImg(ctx.getItemImage(item.name), "item-icon", how.icon)}
        <div class="qc-obj-main">
          <div class="qc-obj-name"><strong>${esc(item.name)}</strong> ${qtyHtml}</div>
          <div class="qc-obj-src">${source}</div>
        </div>
      </li>`;
  }

  function huntRow(h) {
    return `
      <li class="qc-obj">
        <span class="item-icon qc-icon-fallback" aria-hidden="true">⚔️</span>
        <div class="qc-obj-main">
          <div class="qc-obj-name"><strong>Defeat ${esc(h.monster)}</strong> <span class="item-qty-badge">×${h.count}</span></div>
          <div class="qc-obj-src"><span class="qc-how qc-how-drop">⚔️ Lv.${esc(h.level)}${h.timeLimit ? ` · within ${esc(h.timeLimit)}` : ""}</span> <span class="qc-map">@ ${esc(h.map)}</span></div>
        </div>
      </li>`;
  }

  function renderCard(q, ctx) {
    const state = ctx.state;
    const steps = q.steps || [];
    const stepsDone = steps.filter((_, i) => !!state.completedSteps[`${q.id}_${i}`]).length;
    const isDone = steps.length ? stepsDone === steps.length : !!state.completedQuests[q.id];
    const isPartial = steps.length > 0 && stepsDone > 0 && !isDone;
    const isExpanded = !!state.expandedQuests[q.id];
    const runsDone = isDone ? q.cycles : (state.completedCycles[q.id] || 0);
    const warnings = questWarnings(q);
    const npcImg = ctx.getNpcImage(q.npc);

    let runs = "";
    if (q.cycles > 1) {
      let btns = "";
      for (let i = 1; i <= q.cycles; i++) {
        btns += `<button type="button" class="cycle-btn ${i <= runsDone ? "done" : ""}" title="Run ${i}" aria-pressed="${i <= runsDone}" onclick="setCycleCount('${q.id}', ${i}, event)">${i}</button>`;
      }
      runs = `<div class="cycle-pills" onclick="event.stopPropagation()"><span class="qc-runs-label">🔁 Runs ${runsDone}/${q.cycles}</span>${btns}</div>`;
    }

    const objectives = [
      ...(q.items || []).map(it => objectiveRow(it, q, ctx)),
      ...(q.hunts || []).map(huntRow)
    ];

    const r = q.rewards;
    const rewardBits = [
      r.baseExp ? `<span class="reward-pill reward-exp">⭐ ${num(r.baseExp * q.cycles)} EXP</span>` : "",
      r.tmExp ? `<span class="reward-pill reward-tm">🌟 ${num(r.tmExp * q.cycles)} TM</span>` : "",
      r.galder ? `<span class="reward-pill reward-galder">💰 ${num(r.galder * q.cycles)} G</span>` : "",
      ...(r.items || []).map(ri => `<span class="reward-pill reward-item">${iconImg(ctx.getRewardImage(ri), "reward-icon", "🎁")} ${esc(ri)}</span>`)
    ].join("");

    const stepsHtml = steps.map((text, i) => {
      const d = !!state.completedSteps[`${q.id}_${i}`];
      return `
        <li class="step-item ${d ? "step-done" : ""}" onclick="toggleStep('${q.id}', ${i}, event)">
          <input type="checkbox" ${d ? "checked" : ""} aria-label="Step ${i + 1}" onclick="event.stopPropagation()" onchange="toggleStep('${q.id}', ${i}, event)" />
          <span><strong>${i + 1}.</strong> ${esc(text)}</span>
        </li>`;
    }).join("");

    return `
      <div class="quest-card ${isDone ? "completed" : ""} ${isExpanded ? "expanded" : ""}" id="qcard-${q.id}">
        <div class="quest-summary" onclick="toggleExpandQuest('${q.id}')">
          <div class="quest-left">
            <input type="checkbox" class="quest-checkbox" ${isDone ? "checked" : ""} aria-label="Quest done" title="${isDone ? "Done. Click to untick every step" : "Tick every step and mark the quest done"}" onclick="toggleQuestComplete('${q.id}', event)" />
            ${iconImg(npcImg, "qc-npc", "🙂")}
            <div class="quest-title-wrap">
              <div class="quest-title-line">
                <span class="quest-order">#${q.order}</span>
                <span class="quest-title">${esc(q.title)}</span>
              </div>
              <div class="qc-tags">
                ${(q.categories || [q.category]).map(c => `<span class="tag tag-${c.toLowerCase()}">${esc(CATEGORY_NAME[c] || c)}</span>`).join("")}
                <span class="tag tag-level">Lv.${q.minLevel}+</span>
                ${q.classFilter !== "All" ? `<span class="tag tag-job">${esc(q.classFilter)}</span>` : ""}
                ${steps.length > 1 ? `<span class="tag ${isDone ? "tag-everyday" : isPartial ? "tag-key" : "tag-level"}">Steps ${stepsDone}/${steps.length}</span>` : ""}
                ${warnings.map(w => `<span class="tag qc-warn" title="${esc(w)}">⚠️ ${esc(w)}</span>`).join("")}
              </div>
              <div class="quest-meta-line">
                <span class="quest-meta-item">🙋 <strong>${esc(q.npc)}</strong></span>
                <span class="quest-meta-item">📍 ${esc(q.location)}</span>
              </div>
            </div>
          </div>
          <div class="quest-right">
            ${runs}
            <button type="button" class="expand-btn" title="Steps and details" aria-label="Steps and details" aria-expanded="${isExpanded}">▾</button>
          </div>
        </div>

        <div class="qc-body">
          <div class="qc-section">
            <h4 class="qc-h">🎒 To do${q.cycles > 1 ? ` <span class="qc-h-note">(${q.cycles} runs)</span>` : ""}</h4>
            ${objectives.length ? `<ul class="qc-objs">${objectives.join("")}</ul>` : `<div class="qc-none">💬 Just talk / deliver, nothing to collect</div>`}
          </div>
          <div class="qc-section qc-rewards">
            <h4 class="qc-h">🎁 Rewards${q.cycles > 1 ? ` <span class="qc-h-note">(all ${q.cycles} runs)</span>` : ""}</h4>
            <div class="rewards-wrap">${rewardBits || `<span class="qc-none">—</span>`}</div>
          </div>
        </div>

        <div class="quest-details">
          <div class="qc-section">
            <h4 class="qc-h qc-steps-h">
              <span>📝 Steps ${stepsDone}/${steps.length}</span>
              <button type="button" class="btn qc-small-btn" onclick="toggleQuestComplete('${q.id}', event)">${isDone ? "↩️ Untick all" : "✅ Tick all"}</button>
            </h4>
            <ul class="step-list">${stepsHtml}</ul>
          </div>
          ${q.notes ? `<div class="quest-note">💡 <strong>Tip:</strong> ${esc(q.notes)}</div>` : ""}
          <div class="qc-prereq">🔑 <strong>Needs first:</strong> ${esc(q.prereq)}</div>
          <a class="qc-report" target="_blank" rel="noopener"
             href="https://github.com/TeeraMU/trickster-companion/issues/new?template=wrong-data.yml&quest=${encodeURIComponent(q.id + " · " + q.title)}">🐞 Something wrong in this quest? Report it</a>
        </div>
      </div>`;
  }

  root.TQCard = Object.assign({ render: renderCard }, helpers);
})(typeof window !== "undefined" ? window : globalThis);

// 👑 Bosses page: every area boss (data/bosses.json, from the wiki's boss pages) with its trials as a
// checklist, the client's numbers (Battle Summary card from js/planner.js), the quests about it and its
// drops. Ticks live in appState.completedSteps ("boss:Tombeth_2", "boss:Tombeth_beaten"), so they sync
// like quest steps. Model functions are pure (node scripts/test-boss.js); the renderer gets everything
// through a context object.
(function (root) {
  "use strict";

  const WIKI_PAGE = "https://wikimirror.lifeto.co/wiki.ggftw.com/trickster/";

  /**
   * The walkthrough cut into parts to tick: what to do before the trials (when there is anything),
   * then one part per trial heading. [{ title, lines: [{ d, t }] }]
   */
  function sections(walk) {
    const out = [];
    let cur = null;
    for (const l of walk || []) {
      if (l.h) {
        cur = { title: l.t.replace(/:\s*$/, ""), lines: [] };
        out.push(cur);
      } else {
        if (!cur) { cur = { title: "Before the trials", lines: [], intro: true }; out.push(cur); }
        cur.lines.push({ d: cur.intro ? l.d : Math.max(0, l.d - 1), t: l.t });
      }
    }
    return out;
  }

  const stepKey = (name, i) => `boss:${name}_${i}`;
  const beatenKey = name => `boss:${name}_beaten`;

  /** How far a player is with a boss: parts ticked of all, and whether it's beaten. */
  function progress(boss, steps) {
    steps = steps || {};
    const parts = sections(boss.walk);
    const done = parts.filter((_, i) => steps[stepKey(boss.name, i)]).length;
    return { done, total: parts.length, beaten: !!steps[beatenKey(boss.name)] };
  }

  /** Who may enter: "Lv.1–150", "Lv.150+", or the wiki's words. */
  function levelText(boss) {
    const lv = boss.levels;
    if (lv && lv[1]) return `Lv.${lv[0]}–${lv[1]}`;
    if (lv) return `Lv.${lv[0]}+`;
    return /none/i.test(boss.restrict || "") ? "Any level" : boss.restrict || "?";
  }

  /** "Tombeth spawns in 20 min after …" -> "20 min". */
  function respawn(boss) {
    const m = /in (\d+\s*(?:min|minutes?|h|hours?))/i.exec(boss.spawn || "");
    return m ? m[1].replace(/minutes?/, "min") : "";
  }

  /** Can this level go in? true / false, or null when we don't know the level or the rule. */
  function canEnter(boss, level) {
    if (!level || !boss.levels) return null;
    const [lo, hi] = boss.levels;
    return level >= lo && (!hi || level <= hi);
  }

  /** The solved puzzles under each part: { partIndex: [puzzle] }, each under the first part whose title has its `at`. */
  function puzzlesByPart(boss, parts) {
    const out = {};
    for (const pz of boss.puzzles || []) {
      const i = parts.findIndex(s => s.title.includes(pz.at));
      if (i >= 0) (out[i] = out[i] || []).push(pz);
    }
    return out;
  }

  const model = { sections, stepKey, beatenKey, progress, levelText, respawn, canEnter, puzzlesByPart };
  if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

  // ---------------------------------------------------------------------------------------------
  // Renderer (browser)
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const jsq = s => esc(String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
  const TYPE_CLASS = { Power: "bd-power", Magic: "bd-magic", Sense: "bd-sense", Charm: "bd-charm" };
  const wikiUrl = b => b.source || WIKI_PAGE + encodeURIComponent(b.name.replace(/ /g, "_")) + ".html";
  const pic = (src, cls, alt) => src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt || "")}" loading="lazy" onerror="this.remove()">` : "";

  /** The hub's sections, in order: [name, bosses] (a boss without `group` is an area boss). */
  function groups(list) {
    const out = [];
    for (const b of list) {
      const name = b.group || "Area bosses";
      let g = out.find(x => x[0] === name);
      if (!g) out.push(g = [name, []]);
      g[1].push(b);
    }
    return out;
  }

  function hub(ctx) {
    const list = ctx.data.bosses;
    const beaten = list.filter(b => progress(b, ctx.steps).beaten).length;
    return `
      <section class="bs-hub">
        <div class="bs-hub-head">
          <h2>👑 Bosses</h2>
          <p class="bd-note">Every area boss in the order you meet them: the trials to reach it as a checklist, its numbers and what it drops. ${beaten} of ${list.length} beaten.</p>
        </div>
        ${groups(list).map(([name, bosses]) => `
        <h3 class="bs-group">${esc(name)} <span class="bd-note">${bosses.filter(b => progress(b, ctx.steps).beaten).length}/${bosses.length}</span></h3>
        <ul class="bs-grid">${bosses.map(b => {
          const p = progress(b, ctx.steps);
          const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
          return `<li><button type="button" class="bs-card ${p.beaten ? "is-beaten" : ""}" onclick="TQBoss.open('${jsq(b.name)}')">
            <span class="bs-card-pics">${pic(b.seal, "bs-seal", "")}${pic(b.sprite || b.img, "bs-card-sprite", b.name)}</span>
            <span class="bs-card-name"><strong>${esc(b.name)}</strong>${p.beaten ? ` <span class="bs-beaten-tag">✓ Beaten</span>` : ""}</span>
            <span class="bs-card-area">${esc(b.area)}</span>
            <span class="bs-card-tags"><span class="tag bs-tag-lv">Boss Lv.${b.level}</span> <span class="tag">${esc(levelText(b))}</span></span>
            <span class="bs-card-prog"><span class="bd-note">Trials ${p.done}/${p.total}</span><span class="area-bar"><span style="width:${pct}%"></span></span></span>
          </button></li>`;
        }).join("")}</ul>`).join("")}
        <p class="bd-note">From the ggFTW Trickster wiki (Tartarus: the Our Trickster Online wiki). Monster numbers in the boss pages are the PlayTrickster client's.</p>
      </section>`;
  }

  function trialBox(b, ctx) {
    const parts = sections(b.walk);
    if (!parts.length) return "";
    const solved = puzzlesByPart(b, parts);
    return `
      <section class="bd-box bs-trials">
        <h4>🧭 How to get there <span class="bd-note">${progress(b, ctx.steps).done}/${parts.length}</span></h4>
        <ol class="bs-trial-list">${parts.map((s, i) => {
          const on = !!ctx.steps[stepKey(b.name, i)];
          return `<li class="bs-trial ${on ? "is-done" : ""}">
            <label class="bs-trial-head"><input type="checkbox" ${on ? "checked" : ""} onchange="TQBoss.step('${jsq(b.name)}', ${i}, this.checked)">
              <strong>${esc(s.title)}</strong></label>
            ${s.lines.length ? `<ul class="bs-trial-lines">${s.lines.map(l => `<li style="--d:${l.d}">${esc(l.t)}</li>`).join("")}</ul>` : ""}
            ${(solved[i] || []).map(puzzleBox).join("")}
          </li>`;
        }).join("")}</ol>
        ${b.notes.length ? `<div class="bs-notes"><p class="pl-res-title">📝 Notes</p>${b.notes.map(l => `<p>${esc(l.t)}</p>`).join("")}</div>` : ""}
      </section>`;
  }

  /** A solved puzzle: what to do, and the solved maps (tap one to open it full size). */
  function puzzleBox(pz) {
    return `
      <details class="bs-puzzle" open>
        <summary>🧩 ${esc(pz.title)}</summary>
        ${pz.text.map(t => `<p>${esc(t)}</p>`).join("")}
        ${(pz.tables || []).map(tb => `
          <table class="bs-answers">${tb.head ? `<thead><tr><th>${esc(tb.head[0])}</th><th>${esc(tb.head[1])}</th></tr></thead>` : ""}
            <tbody>${tb.rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</tbody></table>`).join("")}
        ${pz.images.length ? `<div class="bs-puzzle-maps ${pz.images.length > 1 ? "is-many" : ""}">${pz.images.map(im => `
          <figure>
            ${im.marks ? `<span class="bs-marked" style="aspect-ratio:${im.w}/${im.h}"><img src="${esc(im.src)}" alt="${esc(im.cap)}" loading="lazy">${im.marks.map(m =>
              `<span class="bs-mark" style="left:${(m.x / im.w * 100).toFixed(2)}%;top:${(m.y / im.h * 100).toFixed(2)}%" title="${esc(m.t || m.n)}">${esc(m.n)}</span>`).join("")}</span>`
            : `<a href="${esc(im.src)}" target="_blank" rel="noopener" title="Open full size"><img src="${esc(im.src)}" alt="${esc(im.cap)}" loading="lazy"></a>`}
            <figcaption>${esc(im.cap)}${im.note ? `<span class="bs-puzzle-note">${esc(im.note)}</span>` : ""}</figcaption>
          </figure>`).join("")}</div>` : ""}
      </details>`;
  }

  function fightBox(b, ctx) {
    const mon = ctx.monsters ? (ctx.monsters.monsters || []).find(m => m.id === b.monster) : null;
    const P = root.TQPlanner;
    const card = mon && P && P.monsterCard ? P.monsterCard(mon)
      : `<p class="bd-note">${ctx.monsters ? "No client numbers for this boss." : "Loading numbers…"}</p>`;
    const w = b.wiki || {};
    return `
      <section class="bd-box bs-fight">
        <h4>⚔️ The fight</h4>
        ${card}
        <p class="bd-note bs-wiki-line">Wiki: ${b.type ? esc(b.type) + " type" : "boss"}${b.weak ? ` · weak to ${esc(b.weak)}` : ""}${b.resist ? ` · resists ${esc(b.resist)}` : ""}${w.hp ? ` · HP ${esc(w.hp)}` : ""}${w.dp ? ` · DP ${esc(w.dp)}` : ""}</p>
        ${b.skills.length ? `<p class="pl-res-title">✨ Skills it uses</p>
          <ul class="bs-chips">${b.skills.map(s => `<li class="tag">${esc(s.n)}${s.lv ? ` <span class="bd-note">Lv.${s.lv}</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${b.summons.length ? `<p class="pl-res-title">🐾 Calls in</p>
          <ul class="bs-chips">${b.summons.map(s => `<li class="tag">${esc(s.n)}${s.lv ? ` <span class="bd-note">Lv.${s.lv}</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${mon ? `<button type="button" class="btn btn-sm btn-primary" onclick="TQBoss.toPlanner('${jsq(mon.id)}')">🛠️ Try my build on it (Planner)</button>` : ""}
      </section>`;
  }

  function questBox(b, ctx) {
    // the quest cards themselves (they live here, not on the Quests page): tick steps as usual
    const cards = (b.quests || []).map(id => ctx.questCard(id)).filter(Boolean);
    if (!cards.length) return "";
    const done = (b.quests || []).filter(id => ctx.questDone(id)).length;
    return `
      <section class="bd-box bs-quests">
        <h4>📜 Quests <span class="bd-note">${done}/${cards.length} done</span></h4>
        <div class="bs-quest-cards">${cards.join("")}</div>
      </section>`;
  }

  function dropBox(b, ctx) {
    if (!b.drops.length) return "";
    const open = ctx.ui.drops;
    return `
      <details class="bd-box bs-drops" ${open ? "open" : ""} ontoggle="TQBoss.drops(this.open)">
        <summary><h4>🎁 Drops <span class="bd-note">${b.drops.length}</span></h4></summary>
        <ul class="bs-drop-list">${b.drops.map(d => `<li>
          ${pic(d.img, "bs-drop-pic", "")}
          <span class="bs-drop-name"><strong>${esc(d.n)}</strong>${d.rate ? ` <span class="tag">${esc(d.rate)}</span>` : ""}</span>
          <span class="bd-note">${esc(d.use)}</span></li>`).join("")}</ul>
      </details>`;
  }

  function page(b, ctx) {
    const p = progress(b, ctx.steps);
    const enter = canEnter(b, ctx.level);
    const rs = respawn(b);
    const list = ctx.data.bosses;
    const i = list.indexOf(b);
    const prev = list[i - 1], next = list[i + 1];
    return `
      <section class="bs-page">
        <div class="bs-nav">
          <button type="button" class="btn btn-sm" onclick="TQBoss.open('')">← All bosses</button>
          <span class="bs-nav-steps">
            ${prev ? `<button type="button" class="btn btn-sm" onclick="TQBoss.open('${jsq(prev.name)}')">‹ ${esc(prev.name)}</button>` : ""}
            ${next ? `<button type="button" class="btn btn-sm" onclick="TQBoss.open('${jsq(next.name)}')">${esc(next.name)} ›</button>` : ""}
          </span>
        </div>
        <header class="bd-box bs-head ${p.beaten ? "is-beaten" : ""}">
          ${pic(b.img, "bs-head-pic", b.name)}
          <div class="bs-head-info">
            <h2>${pic(b.seal, "bs-seal", "")} ${esc(b.name)}</h2>
            <p class="bs-head-where">${esc(b.area)} boss · ${esc(b.location)}</p>
            <p class="bs-head-tags">
              ${b.type ? `<span class="tag ${TYPE_CLASS[b.type] || ""}">${esc(b.type)}</span>` : ""}
              <span class="tag bs-tag-lv">Boss Lv.${b.level}</span>
              <span class="tag ${enter === false ? "bs-no" : enter ? "bs-yes" : ""}" title="${esc(b.restrict)}">Enter: ${esc(levelText(b))}${enter === false ? " (not your level)" : ""}</span>
              ${rs ? `<span class="tag" title="${esc(b.spawn)}">⏱️ Back in ${esc(rs)}</span>` : ""}
            </p>
            <p class="bs-head-actions">
              <button type="button" class="btn btn-sm ${p.beaten ? "btn-primary" : ""}" aria-pressed="${p.beaten}" onclick="TQBoss.beaten('${jsq(b.name)}', ${!p.beaten})">${p.beaten ? "✓ Beaten" : "Mark as beaten"}</button>
              <a class="btn btn-sm" href="${esc(wikiUrl(b))}" target="_blank" rel="noopener">📖 Wiki page</a>
            </p>
          </div>
        </header>
        <div class="bs-cols">
          <div class="bs-col">${trialBox(b, ctx)}</div>
          <div class="bs-col">${fightBox(b, ctx)}${dropBox(b, ctx)}</div>
        </div>
        ${questBox(b, ctx)}
        <p class="bd-note">Walkthrough and drops from the <a href="${esc(wikiUrl(b))}" target="_blank" rel="noopener">${b.source ? "Our Trickster Online wiki (CC-BY-SA)" : "ggFTW wiki"}</a>; PlayTrickster may differ.</p>
      </section>`;
  }

  /**
   * ctx: { data: bosses.json, monsters: monsters.json or null, steps: appState.completedSteps,
   *        open: boss name or "", level: player level or 0, ui: { drops },
   *        questCard(id) -> the quest's card HTML (renderQuestCard), questDone(id) -> true / false }
   */
  function render(ctx) {
    if (!ctx.data) return `<p class="calc-desc">Loading bosses…</p>`;
    const b = ctx.data.bosses.find(x => x.name === ctx.open);
    return b ? page(b, ctx) : hub(ctx);
  }

  root.TQBoss = Object.assign({ render }, model);
})(typeof window !== "undefined" ? window : globalThis);

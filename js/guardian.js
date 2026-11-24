// 🥚 Guardian page: how to get a guardian (Card Identification -> Soul Seed -> raise the egg -> Soul
// Guardian -> Mind's Eye) as a checklist with its quests, how the egg's graph grows, graphs to aim
// for step by step, the legendary guide, the guardians, their skills and runes. Data: data/guardian.json
// (written by hand from the wiki's guides and a Thai players' guide). Ticks are steps ("guard:0") in
// appState.completedSteps, so they sync. Model functions are pure (node scripts/test-guardian.js).
(function (root) {
  "use strict";

  const WIKI_IMG = "https://wikimirror.lifeto.co/asset.103.ggftw.net/wiki/to-w/images/";
  const LINES = ["Power", "Magic", "Sense", "Charm"];
  const stepKey = i => `guard:${i}`;

  /** Stages ticked, of all. */
  function progress(data, steps) {
    steps = steps || {};
    const total = (data.stages || []).length;
    return { done: (data.stages || []).filter((_, i) => steps[stepKey(i)]).length, total };
  }

  /** A graph [P, M, S, C] as the game writes it: "6044". */
  const graphText = g => (g || []).join("");

  /**
   * What a graph hatches into: the highest line (a tie goes to whichever line got there first, so the
   * caller's order of steps decides: `first` = the line that reached the top value first), its total,
   * and whether it's ready (14 in all, or a line at 6).
   */
  function hatch(g, first) {
    const top = Math.max(...g);
    const tied = LINES.filter((_, i) => g[i] === top);
    const type = tied.length > 1 && first && tied.includes(first) ? first : tied[0];
    const total = g.reduce((n, v) => n + v, 0);
    return { type, total, ready: total >= 14 || top >= 6, hatched: g.map(v => v || 1) };
  }

  /** Check a recipe: every step only grows, the last one is the graph it names, and it's ready. */
  function checkRecipe(r) {
    const errs = [];
    let prev = [0, 0, 0, 0];
    r.steps.forEach((s, i) => {
      if (!Array.isArray(s.after) || s.after.length !== 4) errs.push(`step ${i + 1}: after must be 4 numbers`);
      else if (s.after.some((v, k) => v < prev[k] || v > 6)) errs.push(`step ${i + 1}: a line goes down or past 6`);
      prev = s.after || prev;
    });
    if (graphText(prev) !== r.graph) errs.push(`ends at ${graphText(prev)}, not ${r.graph}`);
    if (!hatch(prev).ready) errs.push("not ready to hatch");
    return errs;
  }

  const model = { LINES, stepKey, progress, graphText, hatch, checkRecipe };
  if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

  // ---------------------------------------------------------------------------------------------
  // Renderer (browser)
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LINE_CLASS = { Power: "bd-power", Magic: "bd-magic", Sense: "bd-sense", Charm: "bd-charm", MyShop: "" };

  /** The egg's graph as the game draws it: Power top left, Magic top right, Sense bottom left, Charm bottom right. */
  function graph(g, big) {
    return `<span class="gd-graph ${big ? "is-big" : ""}" role="img" aria-label="${LINES.map((l, i) => `${l} ${g[i]}`).join(", ")}">${
      LINES.map((l, i) => `<span class="gd-g-${l.toLowerCase()}">${g[i]}</span>`).join("")}</span>`;
  }

  function stagesBox(data, ctx) {
    const p = progress(data, ctx.steps);
    return `
      <section class="bd-box gd-stages">
        <h4>🧭 Getting a guardian <span class="bd-note">${p.done}/${p.total}</span></h4>
        <ol class="bs-trial-list">${data.stages.map((s, i) => {
          const on = !!ctx.steps[stepKey(i)];
          const cards = (s.quests || []).map(id => ctx.questCard(id)).filter(Boolean);
          const qDone = (s.quests || []).filter(id => ctx.questDone(id)).length;
          return `<li class="bs-trial ${on ? "is-done" : ""}">
            <label class="bs-trial-head"><input type="checkbox" ${on ? "checked" : ""} onchange="TQGuardian.step(${i}, this.checked)">
              <strong>${esc(s.title)}</strong> <span class="tag">${esc(s.level)}</span></label>
            <ul class="bs-trial-lines">${s.lines.map(l => `<li style="--d:${l.d}">${esc(l.t)}</li>`).join("")}</ul>
            ${cards.length ? `<details class="gd-quests" ${ctx.ui.quests === i ? "open" : ""} ontoggle="TQGuardian.quests(${i}, this.open)">
              <summary>📜 Its quests <span class="bd-note">${qDone}/${cards.length} done</span></summary>
              <div class="bs-quest-cards">${cards.join("")}</div></details>` : ""}
          </li>`;
        }).join("")}</ol>
      </section>`;
  }

  function growBox(data) {
    return `
      <section class="bd-box gd-grow">
        <h4>🌱 How the egg grows</h4>
        <ul class="gd-rules">${data.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
        <div class="gd-actions">${data.actions.map(a => `
          <div class="gd-action ${LINE_CLASS[a.line]}">
            <p class="gd-action-head"><strong>${esc(a.line)}</strong></p>
            <ul>${a.items.map(it => `<li><span>${esc(it.do)}</span>${it.per ? ` <span class="bd-note">${esc(it.per)}</span>` : ""}${it.cap ? ` <span class="tag">up to ${it.cap}</span>` : ""}${it.note ? `<br><span class="bd-note">${esc(it.note)}</span>` : ""}</li>`).join("")}</ul>
          </div>`).join("")}</div>
      </section>`;
  }

  function recipesBox(data, ctx) {
    const open = ctx.ui.recipe || data.recipes[0].graph;
    const r = data.recipes.find(x => x.graph === open) || data.recipes[0];
    const end = r.steps[r.steps.length - 1].after;
    return `
      <section class="bd-box gd-recipes">
        <h4>📈 Graphs, step by step</h4>
        <div class="gd-recipe-tabs" role="tablist">${data.recipes.map(x => `
          <button type="button" role="tab" aria-selected="${x === r}" class="gd-recipe-tab ${x === r ? "is-on" : ""} ${LINE_CLASS[x.type]}" onclick="TQGuardian.recipe('${esc(x.graph)}')">
            ${graph(x.steps[x.steps.length - 1].after)}<span><b>${esc(x.graph)}</b><br><span class="bd-note">${esc(x.type)}</span></span></button>`).join("")}</div>
        <p class="gd-recipe-sum">${graph(end, true)} <span><strong>${esc(r.graph)}</strong>: a ${esc(r.type)} guardian${r.for ? `, ${esc(r.for)}` : ""}.
          <span class="bd-note">Hatches as ${esc(graphText(hatch(end).hatched))}.</span></span></p>
        <ol class="gd-recipe-steps">${r.steps.map(s => `
          <li><span class="gd-step-do">${esc(s.do)} <span class="tag">${esc(s.n)}</span></span>${graph(s.after)}</li>`).join("")}</ol>
        <p class="bd-note">Numbers from players' guides (2012); the drill and miss counts vary.</p>
      </section>`;
  }

  function legendaryBox(data) {
    return `
      <section class="bd-box gd-legend">
        <h4>🌟 Legendary guardian</h4>
        <ol class="gd-list">${data.legendary.map(t => `<li>${esc(t)}</li>`).join("")}</ol>
      </section>`;
  }

  function guardiansBox(data) {
    return `
      <section class="bd-box gd-guardians">
        <h4>🐣 The guardians</h4>
        <ul class="gd-grid">${data.guardians.map(g => `
          <li class="gd-card ${LINE_CLASS[g.type]}">
            <img src="${esc(WIKI_IMG + g.img)}" alt="${esc(g.name)}" loading="lazy" onerror="this.remove()">
            <span><strong>${esc(g.name)}</strong> <span class="tag">${esc(g.type)}</span>${g.skill ? `<br><span class="bd-note">Own skill: ${esc(g.skill)}</span>` : ""}
            <br><span class="gd-about">${esc(g.about)}</span></span>
          </li>`).join("")}</ul>
      </section>`;
  }

  function skillsBox(data) {
    const s = data.skills;
    const lines = list => `<div class="gd-skill-lines">${LINES.map(l => `
      <div class="${LINE_CLASS[l]}"><p class="pl-res-title">${esc(l)}${s.teachers[l] && list === s.first ? ` <span class="bd-note">teacher: ${esc(s.teachers[l])}</span>` : ""}</p>
        <ul class="bs-chips">${(list[l] || []).map(n => `<li class="tag">${esc(n)}</li>`).join("")}</ul></div>`).join("")}</div>`;
    return `
      <section class="bd-box gd-skills">
        <h4>✨ Skills and runes</h4>
        <p>${esc(s.note)}</p>
        ${lines(s.first)}
        <details><summary>2nd-job skills with a blue rune</summary><p class="bd-note">${esc(s.runeNote)}</p>${lines(s.second)}</details>
        <p class="pl-res-title">💎 Runes</p>
        <ul class="gd-list">${data.runes.map(r => `<li><strong>${esc(r.colour)}</strong>: ${esc(r.t)}</li>`).join("")}</ul>
        <ul class="gd-list bd-note">${data.notes.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      </section>`;
  }

  function render(ctx) {
    const data = ctx.data;
    if (!data) return `<p class="calc-desc">Loading…</p>`;
    return `
      <section class="gd-page">
        <div class="bs-hub-head">
          <h2>🥚 Guardian</h2>
          <p class="bd-note">Your own guardian: the quests from Lv.65 to Lv.180, raising its egg to the graph you want, and what it can learn.</p>
        </div>
        <div class="bs-cols">
          <div class="bs-col">${stagesBox(data, ctx)}${legendaryBox(data)}</div>
          <div class="bs-col">${recipesBox(data, ctx)}${growBox(data)}</div>
        </div>
        ${guardiansBox(data)}
        ${skillsBox(data)}
        <p class="bd-note">From ${data.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(", ")}. The game may have changed since: please report what you see.</p>
      </section>`;
  }

  root.TQGuardian = Object.assign({ render, graph }, model);
})(typeof window !== "undefined" ? window : globalThis);

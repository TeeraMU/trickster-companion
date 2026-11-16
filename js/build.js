// Build guide: pick a class and job, see its skills (icons, mastery cards and where they drop), what
// stats its skills use, and plan stat points. Data: data/builds.json (from the wiki; PlayTrickster may
// differ). The model is pure and runs under Node (node scripts/test-build.js); the renderer gets
// what it needs through a context object.
(function (root) {
  "use strict";

  const GROUPS = ["Power", "Magic", "Sense", "Charm"];
  const DEFAULT_GROWTH = { Power: 1, Magic: 2, Sense: 3, Charm: 4 };
  // in game the four growth numbers are 1-4 each and add up to 10 (4-4-1-1 at most two 4s)
  const GROWTH_TOTAL = 10, GROWTH_MIN = 1, GROWTH_MAX = 4;

  /** One − / + on the growth chart; stays within 1-4 and 10 in all. Returns a new object. */
  function stepGrowth(growth, group, d) {
    const next = Object.assign({}, growth);
    const total = GROUPS.reduce((n, g) => n + (growth[g] || 0), 0);
    const v = (growth[group] || GROWTH_MIN) + d;
    if (v < GROWTH_MIN || v > GROWTH_MAX) return next;
    if (d > 0 && total >= GROWTH_TOTAL) return next;
    next[group] = v;
    return next;
  }

  /** A saved chart that can't happen in game (16 in all, a 5) goes back to the default. */
  function fixGrowth(growth) {
    const ok = growth && GROUPS.every(g => growth[g] >= GROWTH_MIN && growth[g] <= GROWTH_MAX) &&
      GROUPS.reduce((n, g) => n + growth[g], 0) <= GROWTH_TOTAL;
    return ok ? growth : Object.assign({}, DEFAULT_GROWTH);
  }

  /** The jobs a job's skills come from, in order: Model, Entertainer, Primadonna. */
  function skillSets(builds, cls, job) {
    const c = builds.classes[cls];
    const j = c && c.jobs.find(x => x.name === job);
    if (!j) return [];
    return j.skillsFrom.map(name => ({ job: name, skills: builds.skills[name] || [] }));
  }

  /** Which stats the job's own skills (2nd and 3rd job, else all) use in their formulas, most first. */
  function statUse(sets) {
    const own = sets.length > 1 ? sets.slice(1) : sets;
    const count = {};
    for (const s of own) for (const sk of s.skills) for (const st of sk.uses || []) count[st] = (count[st] || 0) + 1;
    return Object.entries(count).map(([stat, n]) => ({ stat, n })).sort((a, b) => b.n - a.n || a.stat.localeCompare(b.stat));
  }

  /**
   * A plain build line from the skill formulas: "Pure AP" when one stat leads clearly, "AP + HV" when
   * two are close. { label, stats: [..], why }
   */
  function advice(builds, cls, job) {
    const use = statUse(skillSets(builds, cls, job));
    if (!use.length) return { label: "", stats: [], why: "" };
    const [a, b] = use;
    const two = b && b.n >= a.n * 0.75;
    const stats = two ? [a.stat, b.stat] : [a.stat];
    const name = s => builds.stats.names[s] || s;
    const label = two ? `${a.stat} + ${b.stat}` : `Pure ${a.stat}`;
    const why = two
      ? `${a.n} skills use ${name(a.stat)} and ${b.n} use ${name(b.stat)}: split your bonus points between ${a.stat} and ${b.stat}.`
      : `${a.n} skill${a.n === 1 ? "" : "s"} use ${name(a.stat)}${b ? ` (next: ${b.stat}, ${b.n})` : ""}: put every bonus point in ${a.stat}.`;
    return { label, stats, why };
  }

  /**
   * Stat gain from levels (wiki Stats page): each level gives every attribute of a group as many
   * pips as the growth chart says (1-4), plus 4 bonus pips to place; 4 pips = 1 attribute level.
   * plan: { level, growth: { Power, Magic, Sense, Charm }, bonus: { AP: 70, HV: 30 } (percent) }
   * Returns [{ stat, group, growthLv, bonusLv, gain }] (base stats and equipment not included).
   */
  function statPlan(stats, plan) {
    const level = Math.max(1, Math.min(999, Math.floor(plan.level || 1)));
    const lvls = level - 1; // stats grow on level ups
    const bonusPips = lvls * stats.bonusPerLevel;
    const out = [];
    for (const g of GROUPS) {
      for (const st of stats.groups[g]) {
        const growthPips = lvls * (plan.growth[g] || 0);
        const pct = (plan.bonus && plan.bonus[st]) || 0;
        const myBonus = Math.floor(bonusPips * pct / 100);
        const growthLv = Math.floor(growthPips / stats.pipsPerLevel);
        const bonusLv = Math.floor((growthPips + myBonus) / stats.pipsPerLevel) - growthLv;
        const per = stats.perAttrLevel[st];
        out.push({ stat: st, group: g, growthLv, bonusLv, gain: Math.round((growthLv + bonusLv) * per * 100) / 100, per });
      }
    }
    return out;
  }

  /** Mastery items for the skills picked to master: [{ name, qty, skills: [..], info }] */
  function masterItems(builds, sets, picked) {
    const by = new Map();
    for (const s of sets) for (const sk of s.skills) {
      if (!picked[sk.name]) continue;
      for (const it of sk.items || []) {
        if (!by.has(it.name)) by.set(it.name, { name: it.name, qty: 0, skills: [], info: builds.items[it.name] || null });
        const r = by.get(it.name);
        r.qty += it.qty;
        r.skills.push(sk.name);
      }
    }
    return [...by.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }

  const model = { GROUPS, DEFAULT_GROWTH, GROWTH_TOTAL, stepGrowth, fixGrowth, skillSets, statUse, advice, statPlan, masterItems };

  if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

  // ---------------------------------------------------------------------------------------------
  // Renderer (browser)
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const jsq = s => esc(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const GROUP_CLASS = { Power: "bd-power", Magic: "bd-magic", Sense: "bd-sense", Charm: "bd-charm" };
  const monLink = name => `<button type="button" class="mon-link" data-mon="${esc(name)}" aria-expanded="false">${esc(name)}</button>`;

  /** Growth chart: four corners like the in-game graph, each with − / + (1-4, 10 in all). */
  function growthChart(growth) {
    const total = GROUPS.reduce((n, g) => n + growth[g], 0);
    const left = GROWTH_TOTAL - total;
    const corner = (g, pos) => `
      <div class="bd-grow ${GROUP_CLASS[g]} bd-grow-${pos}">
        <span class="bd-grow-name">${g}</span>
        <span class="bd-grow-ctl">
          <button type="button" class="bd-step" aria-label="Less ${g}" onclick="TQBuild.growth('${g}', -1)" ${growth[g] <= 1 ? "disabled" : ""}>−</button>
          <strong>${growth[g]}</strong>
          <button type="button" class="bd-step" aria-label="More ${g}" onclick="TQBuild.growth('${g}', 1)" ${growth[g] >= GROWTH_MAX || left <= 0 ? "disabled" : ""}>+</button>
        </span>
        <span class="bd-grow-pct">${growth[g] * 10}%</span>
      </div>`;
    // the chart: one diagonal per group, pointing at its box (Power top left … Charm bottom right),
    // as long as its growth (4 reaches the corner)
    const r = v => 4 + v * 10.5;
    const pts = [[-1, -1, "Power"], [1, -1, "Magic"], [1, 1, "Charm"], [-1, 1, "Sense"]]
      .map(([x, y, g]) => [50 + x * r(growth[g]), 50 + y * r(growth[g])].map(n => n.toFixed(1)).join(",")).join(" ");
    return `
      <div class="bd-growth">
        ${corner("Power", "tl")}${corner("Magic", "tr")}
        <svg class="bd-diamond" viewBox="0 0 100 100" aria-hidden="true">
          <rect x="4" y="4" width="92" height="92" rx="10" class="bd-diamond-frame" />
          <line x1="4" y1="4" x2="96" y2="96" class="bd-diamond-axis" /><line x1="96" y1="4" x2="4" y2="96" class="bd-diamond-axis" />
          <polygon points="${pts}" class="bd-diamond-fill" />
        </svg>
        ${corner("Sense", "bl")}${corner("Charm", "br")}
      </div>
      <p class="bd-note ${left === 0 ? "" : "bd-warn"}">Growth ${GROUPS.map(g => growth[g]).join("-")} · ${left === 0
        ? "10 points, as picked when you made the character"
        : left > 0 ? `${left} point${left === 1 ? "" : "s"} left to place (10 in all, 1-4 each)` : `${-left} too many: 10 in all`}</p>`;
  }

  function cardChip(builds, it) {
    const info = builds.items[it.name];
    const img = (info && info.img) || (root.getItemImage ? root.getItemImage(it.name) : "");
    return `<button type="button" class="bd-card" onclick="TQSearch.find('${jsq(it.name)}')" title="Where to get ${esc(it.name)}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="bd-card-ph" aria-hidden="true">🃏</span>`}
        <span>${esc(it.name)}</span> <strong>×${it.qty}</strong>
      </button>`;
  }

  function whereLine(info) {
    if (!info) return "";
    if (!info.from.length) return `<span class="bd-where">${esc(info.how)}</span>`;
    return info.from.map(f => `<span class="bd-where">${f.take ? "🫳 Take from" : "⚔️ Drop"} ${monLink(f.monster)}${f.level ? ` <span class="ep-lv">Lv.${f.level}</span>` : ""}${f.maps.length ? ` · 📍 ${esc(f.maps.join(" · "))}` : ""}</span>`).join("");
  }

  function skillRow(builds, sk, picked) {
    const on = !!picked[sk.name];
    const canMaster = (sk.items || []).length > 0;
    return `
      <li class="bd-skill ${on ? "is-picked" : ""}">
        ${sk.icon ? `<img class="bd-skill-icon" src="${esc(sk.icon)}" alt="" loading="lazy">` : `<span class="bd-skill-icon bd-skill-ph" aria-hidden="true">✨</span>`}
        <div class="bd-skill-main">
          <div class="bd-skill-name"><strong>${esc(sk.name)}</strong>
            <span class="tag">TM ${sk.tm}</span> <span class="tag">${esc(sk.type || "")}</span>
            ${sk.prereq ? `<span class="bd-prereq">needs ${esc(sk.prereq)}</span>` : ""}</div>
          ${sk.desc ? `<div class="bd-desc">${esc(sk.desc)}</div>` : ""}
          ${sk.formula ? `<div class="bd-formula"><code>${esc(sk.formula)}</code></div>` : ""}
          ${canMaster ? `<div class="bd-master">🎓 Master: ${sk.items.map(it => cardChip(builds, it)).join(" ")}</div>` : `<div class="bd-master bd-note">No mastery item</div>`}
        </div>
        ${canMaster ? `<label class="bd-pick"><input type="checkbox" ${on ? "checked" : ""} onchange="TQBuild.pick('${jsq(sk.name)}', this.checked)"> Master</label>` : ""}
      </li>`;
  }

  /**
   * ctx: { builds, state: { cls, job, tab, growth, level, bonus: {stat: pct}, picked: {skill: true} },
   *        have: bag counts }
   */
  function render(ctx) {
    const b = ctx.builds, st = ctx.state;
    const cls = b.classes[st.cls] ? st.cls : Object.keys(b.classes)[0];
    const c = b.classes[cls];
    const job = c.jobs.find(j => j.name === st.job) || c.jobs[c.jobs.length - 2] || c.jobs[0];
    const sets = skillSets(b, cls, job.name);
    const use = statUse(sets);
    const adv = advice(b, cls, job.name);
    const guides = [...(job.guides || []), ...(c.guides || [])];

    const classChips = Object.keys(b.classes).map(k => `<button type="button" class="pill-btn ${k === cls ? "active" : ""}" onclick="TQBuild.set({ cls: '${k}', job: '' })">${esc(k)}</button>`).join("");
    const jobChips = c.jobs.map(j => `<button type="button" class="pill-btn ${j.name === job.name ? "active" : ""}" onclick="TQBuild.set({ job: '${jsq(j.name)}' })">${esc(j.name)}${j.stage === 3 ? ` <span class="bd-stage">${j.hybridOf ? "hybrid" : "pure"}</span>` : ""}</button>`).join("");

    const profile = `
      <section class="bd-profile">
        <div class="bd-art">${job.art ? `<img src="${esc(job.art)}" alt="${esc(job.name)}" loading="lazy">` : ""}</div>
        <div class="bd-info">
          <h3>${esc(job.name)} <span class="bd-type ${GROUP_CLASS[c.type]}">${esc(c.type)} type</span></h3>
          <p class="bd-note">${esc(cls)} · ${job.stage === 1 ? "1st job" : job.stage === 2 ? "2nd job" : job.hybridOf ? `3rd job (hybrid, ${esc(job.hybridOf)} skills at TM +50)` : "3rd job"} · skills from ${sets.map(s => esc(s.job)).join(" → ")}</p>
          ${growthChart(st.growth)}
          ${use.length ? `<p class="bd-uses">Skills use: ${use.slice(0, 5).map(u => `<span class="tag">${u.stat} ×${u.n}</span>`).join(" ")}</p>` : ""}
        </div>
      </section>`;

    const tabs = [["stats", "📊 Stats"], ["skills", "✨ Skills"]];
    const tabBar = `<div class="bd-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="pill-btn ${st.tab === k ? "active" : ""}" aria-selected="${st.tab === k}" onclick="TQBuild.set({ tab: '${k}' })">${l}</button>`).join("")}
      <span class="bd-later" title="Coming in a later version">🛡️ Equipment · 💥 Damage: later</span></div>`;

    let body = "";
    if (st.tab === "skills") {
      const items = masterItems(b, sets, st.picked);
      const have = ctx.have || {};
      const totals = items.length ? `
        <section class="bd-box">
          <h4>🃏 Cards to collect for the skills you picked</h4>
          <ul class="bd-items">${items.map(it => {
            const got = have[it.name] || 0;
            return `<li>${cardChip(b, it)} ${got ? `<span class="qc-have ${got >= it.qty ? "is-enough" : ""}">🎒 have ${got}</span>` : ""}
              <div class="bd-item-where">${whereLine(it.info)} <span class="bd-note">for ${esc(it.skills.join(", "))}</span></div></li>`;
          }).join("")}</ul>
        </section>` : `<p class="bd-note">Tick <b>Master</b> on the skills you want to master to add up their cards here.</p>`;
      // this job's own skills first, then the earlier jobs'
      body = totals + sets.slice().reverse().map(s => `
        <section class="bd-box">
          <h4>${esc(s.job)} skills <span class="bd-note">${s.skills.length}</span></h4>
          <ul class="bd-skills">${s.skills.map(sk => skillRow(b, sk, st.picked)).join("")}</ul>
        </section>`).join("");
    } else {
      const plan = statPlan(b.stats, { level: st.level, growth: st.growth, bonus: st.bonus });
      const all = GROUPS.flatMap(g => b.stats.groups[g]);
      const bonusRows = all.map(s => {
        const v = st.bonus[s] || 0;
        return `<label class="bd-bonus ${v ? "is-on" : ""}"><span>${s}</span>
          <input type="number" min="0" max="100" step="10" value="${v}" aria-label="Bonus points in ${s}, percent" onchange="TQBuild.bonus('${s}', this.value)"> %</label>`;
      }).join("");
      const sum = all.reduce((n, s) => n + (st.bonus[s] || 0), 0);
      const fmt = r => r.stat === "DX" ? (r.gain ? r.gain.toFixed(1) : "0") : (Math.abs(r.gain) < 10 && r.gain % 1 ? r.gain.toFixed(2) : Math.round(r.gain).toLocaleString());
      body = `
        <section class="bd-box bd-advice">
          <h4>🧭 Suggested build: <span class="bd-build">${esc(adv.label || "—")}</span></h4>
          <p>${esc(adv.why)}</p>
          ${adv.stats.length ? `<button type="button" class="btn qc-small-btn" onclick="TQBuild.useAdvice()">Use this in the planner</button>` : ""}
          <p class="bd-note">From the wiki's skill formulas, not from players. Check a guide${guides.length ? ": " + guides.map(g => `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.title)}</a>`).join(" · ") : ""} or ask your guild.</p>
        </section>
        <section class="bd-box">
          <h4>📈 Stat planner</h4>
          <div class="bd-plan-top">
            <label>Level <input type="number" min="1" max="999" value="${st.level}" onchange="TQBuild.set({ level: +this.value || 1 })"></label>
            <span class="bd-note">4 bonus points per level · bonus split ${sum}%${sum !== 100 ? ` <span class="bd-warn">(make it 100%)</span>` : ""}</span>
          </div>
          <div class="bd-bonus-grid">${bonusRows}</div>
          <table class="bd-stats">
            <thead><tr><th>Stat</th><th>From growth</th><th>From bonus</th><th>Gain</th></tr></thead>
            <tbody>${plan.map(r => `<tr class="${GROUP_CLASS[r.group]} ${adv.stats.includes(r.stat) ? "is-main" : ""}">
              <td><strong>${r.stat}</strong> <span class="bd-note">${esc(b.stats.names[r.stat])}</span></td>
              <td>Lv ${r.growthLv}</td><td>${r.bonusLv ? `+${r.bonusLv}` : "–"}</td><td><strong>${fmt(r)}</strong></td></tr>`).join("")}</tbody>
          </table>
          <p class="bd-note">Gain from levels only (wiki Stats page: AP +4, HP +30 per stat level; HV, LK, MA +1 per 4 levels…). Your starting stats and equipment come on top.</p>
        </section>`;
    }

    return `
      <div class="bd-page">
        <div class="bd-pick-row">${classChips}</div>
        <div class="bd-pick-row">${jobChips}</div>
        ${profile}
        ${tabBar}
        ${body}
        <p class="bd-note bd-source">Data: ggFTW Trickster wiki. PlayTrickster may differ: tell us what's wrong and we'll fix it.</p>
      </div>`;
  }

  root.TQBuild = Object.assign({ render }, model);
})(typeof window !== "undefined" ? window : globalThis);

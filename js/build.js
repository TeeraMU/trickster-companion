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

  /**
   * One job's skills as a tree, like quests under the quest they need: a skill sits under the first
   * skill it needs from the same job. Returns [{ skill, depth, parent }] in reading order.
   */
  function skillTree(skills) {
    const byName = new Map(skills.map(s => [s.name, s]));
    const parentOf = new Map();
    for (const s of skills) {
      const p = (s.needs || []).find(n => n.name !== s.name && byName.has(n.name));
      if (p) parentOf.set(s.name, p.name);
    }
    // a loop in the data (A needs B needs A) would hide both: cut it
    for (const s of skills) {
      const seen = new Set([s.name]);
      for (let p = parentOf.get(s.name); p; p = parentOf.get(p)) {
        if (seen.has(p)) { parentOf.delete(s.name); break; }
        seen.add(p);
      }
    }
    const kids = new Map();
    for (const s of skills) {
      const p = parentOf.get(s.name);
      if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(s); }
    }
    const out = [];
    const walk = (s, depth) => {
      out.push({ skill: s, depth, parent: parentOf.get(s.name) || "" });
      for (const k of kids.get(s.name) || []) walk(k, depth + 1);
    };
    for (const s of skills) if (!parentOf.has(s.name)) walk(s, 0);
    return out;
  }

  /**
   * Level 1 -> Master at a glance, from the wiki's per-level table: MP, cooldown and up to two more
   * columns (power, targets…). [{ col, from, to }] ("8s" for "8 seconds"; from === to when it stays).
   */
  function levelSummary(levels) {
    if (!levels || !levels.rows.length) return [];
    const first = levels.rows[0], last = levels.rows[levels.rows.length - 1];
    const short = v => String(v || "").replace(/\s*seconds?\b/i, "s").replace(/\s*minutes?\b/i, "m").trim();
    const cols = levels.cols.map((c, i) => ({ col: c, i })).filter(c => c.i > 0 && first[c.i] && last[c.i]);
    const isMp = c => /^MP$/i.test(c.col);
    const isCd = c => /cool|cooltime/i.test(c.col);
    const pick = [...cols.filter(isMp), ...cols.filter(isCd).slice(0, 1)];
    for (const c of cols) if (pick.length < 4 && !pick.includes(c) && !isMp(c) && !isCd(c)) pick.push(c);
    return pick.sort((a, b) => a.i - b.i).map(c => ({ col: c.col, from: short(first[c.i]), to: short(last[c.i]) }));
  }

  /**
   * In-game corrections (data/skill-fixes.json) over the wiki data: each fix replaces those fields of
   * the skill in every job that has it and marks it `checked`. Changes builds in place; returns how
   * many skill entries changed.
   */
  const FIX_FIELDS = ["items", "tm", "master", "learn", "needs", "how"];
  function applyFixes(builds, fixes) {
    let n = 0;
    const list = (fixes && fixes.skills) || {};
    for (const skills of Object.values(builds.skills)) {
      for (const sk of skills) {
        const f = list[sk.name];
        if (!f) continue;
        for (const k of FIX_FIELDS) if (k in f) sk[k] = JSON.parse(JSON.stringify(f[k]));
        sk.checked = f.checked || "in game";
        n++;
      }
    }
    return n;
  }

  const model = { GROUPS, DEFAULT_GROWTH, GROWTH_TOTAL, stepGrowth, fixGrowth, skillSets, statUse, advice, statPlan, masterItems, skillTree, levelSummary, applyFixes };

  if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

  // ---------------------------------------------------------------------------------------------
  // Renderer (browser)
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const jsq = s => esc(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const GROUP_CLASS = { Power: "bd-power", Magic: "bd-magic", Sense: "bd-sense", Charm: "bd-charm" };
  const monLink = name => `<button type="button" class="mon-link" data-mon="${esc(name)}" aria-expanded="false">${esc(name)}</button>`;

  // the in-game type badges (wiki, 17x15: shown at 2x with crisp pixels)
  const WIKI_IMG = "https://wikimirror.lifeto.co/asset.103.ggftw.net/wiki/to-w/images/";
  const TYPE_ICON = { Power: "a/a0/Power_Icon.gif", Magic: "2/24/Magic_Icon.gif", Sense: "c/cc/Sense_Icon.gif", Charm: "5/53/Charm_Icon.gif" };
  const typeIcon = (g, cls) => `<img class="${cls}" src="${WIKI_IMG + TYPE_ICON[g]}" alt="" width="17" height="15">`;

  /** Growth chart, like the in-game one: a box per type in its corner (badge, number, %), a ring in the middle. */
  function growthChart(growth) {
    const total = GROUPS.reduce((n, g) => n + growth[g], 0);
    const left = GROWTH_TOTAL - total;
    const corner = (g, pos) => `
      <div class="bd-grow ${GROUP_CLASS[g]} bd-grow-${pos}">
        <span class="bd-grow-name">${g}</span>
        <span class="bd-grow-badge">${typeIcon(g, "bd-grow-icon")}<b>${growth[g]}</b></span>
        <span class="bd-grow-pct">${growth[g] * 10}%</span>
        <span class="bd-grow-ctl">
          <button type="button" class="bd-step" aria-label="Less ${g}" onclick="TQBuild.growth('${g}', -1)" ${growth[g] <= 1 ? "disabled" : ""}>−</button>
          <button type="button" class="bd-step" aria-label="More ${g}" onclick="TQBuild.growth('${g}', 1)" ${growth[g] >= GROWTH_MAX || left <= 0 ? "disabled" : ""}>+</button>
        </span>
      </div>`;
    // one spoke per type, pointing at its box (Power top left … Charm bottom right), as long as its
    // growth (4 reaches the ring), and the shape they make
    const DIR = { Power: [-1, -1], Magic: [1, -1], Charm: [1, 1], Sense: [-1, 1] };
    const end = g => { const r = 5 + growth[g] * 7.2; return [50 + DIR[g][0] * r, 50 + DIR[g][1] * r].map(n => n.toFixed(1)); };
    const shape = ["Power", "Magic", "Charm", "Sense"].map(g => end(g).join(",")).join(" ");
    const spokes = GROUPS.map(g => { const [x, y] = end(g); return `<g class="${GROUP_CLASS[g]}"><line x1="50" y1="50" x2="${x}" y2="${y}" class="bd-spoke" /><circle cx="${x}" cy="${y}" r="3.2" class="bd-spoke-end" /></g>`; }).join("");
    return `
      <div class="bd-growth">
        ${corner("Power", "tl")}${corner("Magic", "tr")}
        <svg class="bd-diamond" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" class="bd-ring-teeth" />
          <circle cx="50" cy="50" r="40" class="bd-ring" />
          <circle cx="50" cy="50" r="24" class="bd-ring-inner" />
          <line x1="21" y1="21" x2="79" y2="79" class="bd-diamond-axis" /><line x1="79" y1="21" x2="21" y2="79" class="bd-diamond-axis" />
          <polygon points="${shape}" class="bd-diamond-fill" />
          ${spokes}
          <circle cx="50" cy="50" r="4" class="bd-ring-hub" />
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

  const skillId = name => "bd-sk-" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const lvText = lv => lv === "M" ? "Master" : lv ? "Lv." + lv : "";

  /** "🔒 needs [icon] Sacred Oath · Master" chips; a tap jumps to that skill on the page. */
  function needChips(sk, ctx) {
    if (!(sk.needs || []).length) return "";
    return `<div class="bd-needs"><span class="bd-needs-label">🔒 Needs</span>${sk.needs.map(n => {
      const other = ctx.skillByName.get(n.name);
      const where = other && other.job !== ctx.job ? ` <span class="bd-note">(${esc(other.job)})</span>` : "";
      const icon = other && other.skill.icon ? `<img src="${esc(other.skill.icon)}" alt="" loading="lazy">` : "";
      const label = `${icon}<span>${esc(n.name)}</span>${n.lv ? ` <b class="bd-lv ${n.lv === "M" ? "is-m" : ""}">${lvText(n.lv)}</b>` : ""}${where}`;
      return other
        ? `<button type="button" class="bd-need" onclick="TQBuild.goSkill('${jsq(n.name)}')" title="Go to ${esc(n.name)}">${label}</button>`
        : `<span class="bd-need">${label}</span>`;
    }).join("")}</div>`;
  }

  /** How to get the skill: card pack, quest (linked when the app has it), Chaos Tower, from the start. */
  function howLine(sk, ctx) {
    const h = sk.how;
    if (!h) return ""; // said once in the section heading instead
    if (h.kind === "cardpack") return `<div class="bd-how">🃏 From <strong>${esc(h.text)}</strong></div>`;
    if (h.kind === "drop") return `<div class="bd-how">🗼 Drops from ${esc(h.text)}</div>`;
    if (h.kind === "start") return `<div class="bd-how">🐣 You start with it</div>`;
    const q = ctx.questByTitle ? ctx.questByTitle(h.text) : null;
    return `<div class="bd-how">📜 Quest: ${q
      ? `<button type="button" class="qc-link" onclick="jumpToQuest('${jsq(q.id)}')" title="Go to this quest">${esc(h.text)}</button>`
      : `<strong>${esc(h.text)}</strong>`}</div>`;
  }

  /** "Lv.1 → Master: MP 300 → 660 · Cooldown 8s · Magnification 0.75 → 2.55 · Target 2 → 4" */
  function levelLine(sk) {
    const sum = levelSummary(sk.levels);
    if (!sum.length) return "";
    const last = sk.levels.rows[sk.levels.rows.length - 1][0];
    const lastLabel = /^m(aster)?$/i.test(last) ? "Master" : "Lv." + last;
    return `<div class="bd-lvsum"><span class="bd-lvsum-label">Lv.1 → ${lastLabel}</span> ${sum.map(c =>
      `<span class="bd-lvsum-item"><b>${esc(c.col)}</b> ${c.from === c.to ? esc(c.from) : `${esc(c.from)} → <strong>${esc(c.to)}</strong>`}</span>`).join("")}</div>`;
  }

  // which skills have their detail open (kept across re-renders, e.g. ticking Master)
  const openDetails = new Set();
  function toggleDetail(name, open) { if (open) openDetails.add(name); else openDetails.delete(name); }

  /** ▾ All levels and notes: the wiki's per-level table (Master row in gold) and the full notes. */
  function detailBox(sk) {
    const lv = sk.levels;
    if (!lv && !sk.notes) return "";
    const table = lv ? `
      <div class="bd-lvtable-wrap"><table class="bd-lvtable">
        <thead><tr>${lv.cols.map(c => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${lv.rows.map(r => `<tr class="${/^m(aster)?$/i.test(r[0]) ? "is-m" : ""}">${r.map((v, i) => i === 0 ? `<th scope="row">${esc(/^m$/i.test(v) ? "Master" : v)}</th>` : `<td>${esc(String(v).replace(/\s*seconds?\b/i, "s"))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>` : "";
    return `<details class="bd-detail" ${openDetails.has(sk.name) ? "open" : ""} ontoggle="TQBuild.toggleDetail('${jsq(sk.name)}', this.open)">
        <summary>${lv ? "📋 All levels" : "📋 Notes"}${lv && sk.notes ? " and notes" : ""}</summary>
        ${table}
        ${sk.notes ? `<p class="bd-notes">${esc(sk.notes)}</p>` : ""}
      </details>`;
  }

  function skillRow(builds, node, picked, ctx) {
    const sk = node.skill;
    const on = !!picked[sk.name];
    const canMaster = (sk.items || []).length > 0;
    return `
      <li class="bd-skill ${on ? "is-picked" : ""} ${node.depth ? "is-child" : ""}" id="${skillId(sk.name)}" style="--depth:${node.depth}">
        ${sk.icon ? `<img class="bd-skill-icon" src="${esc(sk.icon)}" alt="" loading="lazy">` : `<span class="bd-skill-icon bd-skill-ph" aria-hidden="true">✨</span>`}
        <div class="bd-skill-main">
          <div class="bd-skill-name"><strong>${esc(sk.name)}</strong>
            <span class="tag">TM ${sk.tm}</span> <span class="tag">${esc(sk.type || "")}</span>
            ${sk.checked ? `<span class="bd-checked" title="${esc(sk.checked)}">✓ In game</span>` : ""}</div>
          ${needChips(sk, ctx)}
          ${howLine(sk, ctx)}
          ${sk.desc ? `<div class="bd-desc">${esc(sk.desc)}</div>` : ""}
          ${sk.formula ? `<div class="bd-formula"><code>${esc(sk.formula)}</code></div>` : ""}
          ${levelLine(sk)}
          ${canMaster ? `<div class="bd-master">🎓 Master: ${sk.items.map(it => cardChip(builds, it)).join(" ")}</div>` : `<div class="bd-master bd-note">No mastery item</div>`}
          ${detailBox(sk)}
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
          <h3>${esc(job.name)} <span class="bd-type ${GROUP_CLASS[c.type]}">${TYPE_ICON[c.type] ? typeIcon(c.type, "bd-type-icon") : ""}${esc(c.type)} type</span></h3>
          <p class="bd-note">${esc(cls)} · ${job.stage === 1 ? "1st job" : job.stage === 2 ? "2nd job" : job.hybridOf ? `3rd job (hybrid, ${esc(job.hybridOf)} skills at TM +50)` : "3rd job"} · skills from ${sets.map(s => esc(s.job)).join(" → ")}</p>
          ${growthChart(st.growth)}
          ${use.length ? `<p class="bd-uses">Skills use: ${use.slice(0, 5).map(u => `<span class="tag">${u.stat} ×${u.n}</span>`).join(" ")}</p>` : ""}
        </div>
      </section>`;

    const tabs = [["stats", "📊 Stats"], ["skills", "✨ Skills"], ...(ctx.renderGear ? [["gear", "🛡️ Equipment"]] : [])];
    const tabBar = `<div class="bd-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="pill-btn ${st.tab === k ? "active" : ""}" aria-selected="${st.tab === k}" onclick="TQBuild.set({ tab: '${k}' })">${l}</button>`).join("")}
      <span class="bd-later" title="Coming in a later version">💥 Damage: later</span></div>`;

    let body = "";
    if (st.tab === "gear" && ctx.renderGear) {
      body = ctx.renderGear(st);
    } else if (st.tab === "skills") {
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
      // every skill on the page by name, for the "Needs" chips
      const skillByName = new Map();
      for (const s of sets) for (const sk of s.skills) skillByName.set(sk.name, { skill: sk, job: s.job });
      body = totals + sets.slice().reverse().map(s => {
        const rowCtx = { skillByName, job: s.job, questByTitle: ctx.questByTitle };
        return `
        <section class="bd-box">
          <h4>${esc(s.job)} skills <span class="bd-note">${s.skills.length} · skills that need another one sit under it</span></h4>
          ${s.skills.some(sk => !sk.how) ? `<p class="bd-note">❔ The wiki doesn't say how to get ${s.skills.every(sk => !sk.how) ? "these skills" : "the skills without a 🃏 / 📜 / 🗼 line"}. Tell us if you know.</p>` : ""}
          <ul class="bd-skills">${skillTree(s.skills).map(node => skillRow(b, node, st.picked, rowCtx)).join("")}</ul>
        </section>`;
      }).join("");
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

  /** Scroll to a skill on the page and flash it. */
  function goSkill(name) {
    const el = document.getElementById(skillId(name));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("is-flash");
    void el.offsetWidth;
    el.classList.add("is-flash");
  }

  root.TQBuild = Object.assign({ render, goSkill, toggleDetail }, model);
})(typeof window !== "undefined" ? window : globalThis);

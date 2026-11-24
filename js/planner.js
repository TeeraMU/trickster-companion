// Build planner: the Build guide's 🛡️ Equipment tab. Gear typed in per slot (name, stats, element:
// items differ between servers, so there is no item list), bonus points per stat, the class's buffs
// (data/buffs.json, values per level from the client in data/buff-values.json) and the status window worked out like the game:
// front number from level, growth and bonus points (data/stat-base.json), "+" from gear and buffs.
// Saved builds are synced; share codes carry a whole build.
// The model is pure and runs under Node (node scripts/test-planner.js); the renderer gets what it
// needs through a context object.
(function (root) {
  "use strict";

  const STATS = ["AP", "AC", "DX", "MP", "MA", "MD", "WT", "DA", "LK", "HP", "DP", "HV"];
  const GROUP_STATS = { Power: ["AP", "AC", "DX"], Magic: ["MP", "MA", "MD"], Sense: ["WT", "DA", "LK"], Charm: ["HP", "DP", "HV"] };
  const GROUP_OF = {};
  for (const [g, list] of Object.entries(GROUP_STATS)) for (const s of list) GROUP_OF[s] = g;
  const ELEMENTS = ["Fire", "Water", "Wind", "Earth", "Elec", "Light", "Dark"];
  // the equipment window: `side` places the slot around the character
  const SLOTS = [
    { key: "hat", label: "Hat", icon: "🎩", side: "left" },
    { key: "weapon", label: "Weapon", icon: "⚔️", side: "left" },
    { key: "acc1", label: "Accessory 1", icon: "💍", side: "left" },
    { key: "inner", label: "Inner", icon: "🎽", side: "left" },
    { key: "cape", label: "Cape", icon: "🧣", side: "left" },
    { key: "ear", label: "Ears", icon: "👂", side: "right" },
    { key: "shield", label: "Shield", icon: "🛡️", side: "right" },
    { key: "acc2", label: "Accessory 2", icon: "💍", side: "right" },
    { key: "tail", label: "Tail", icon: "🦊", side: "right" },
    { key: "pet", label: "Pet", icon: "🐾", side: "right" },
    { key: "fashion1", label: "Fashion 1", icon: "👗", side: "bottom" },
    { key: "fashion2", label: "Fashion 2", icon: "👒", side: "bottom" }
  ];
  const SKILL_LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "M"];
  const LIMITS = { hits: 40, hitNumbers: 20, compound: 5, builds: 20, buffs: 20, name: 40, item: 40, note: 120, notes: 500, skills: 40 };

  const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)));
  const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  const floor = x => Math.floor(x + 1e-9); // 0.25 × 39 is 9.75, never 9.7499…

  /** { AP: 12, … } with known keys, whole numbers, no zeros. */
  function cleanStats(o, keys) {
    const out = {};
    for (const k of keys || STATS) { const v = clamp(o && o[k], -99999999, 99999999); if (v) out[k] = v; }
    return out;
  }

  /** A stat group's level from growth: each level adds `growth` pips, 4 pips = 1 stat level. */
  function groupLevel(level, growth) {
    return floor((4 + (growth || 1) * (Math.max(1, level) - 1)) / 4);
  }

  /** Front number of the status window for one stat. */
  function frontStat(base, per, statLv) {
    return base + floor(per * (statLv - 1));
  }

  /** The starting stat that makes `front` come out at this stat level (to calibrate a class). */
  function baseFromFront(front, per, statLv) {
    return num(front) - floor(per * (statLv - 1));
  }

  /**
   * Starting stats for a class: checked ones (data/stat-base.json), else the ones the player worked
   * out from their own window, else the file's `estimate` class (until someone checks this one).
   * Returns { base, from: "checked" | "mine" | "estimate" | "", checked, estimateFrom }
   */
  function pickBase(statBase, cls, typed) {
    const classes = (statBase && statBase.classes) || {};
    if (classes[cls]) return { base: classes[cls], from: "checked", checked: classes[cls].checked || "", estimateFrom: "" };
    if (typed) return { base: typed, from: "mine", checked: "", estimateFrom: "" };
    const est = statBase && statBase.estimate;
    if (est && classes[est]) return { base: classes[est], from: "estimate", checked: "", estimateFrom: est };
    return { base: null, from: "", checked: "", estimateFrom: "" };
  }

  /**
   * How the player wants to spread bonus points, % per stat: their own plan (build.bonus) or else the
   * suggestion from the skills split evenly (AP + HV -> 50 / 50).
   */
  function planOf(build, advice) {
    const own = {};
    for (const k of STATS) { const v = ((build && build.bonus) || {})[k]; if (v > 0) own[k] = v; }
    if (Object.keys(own).length) return own;
    const s = (advice && advice.stats) || [];
    const out = {};
    s.forEach((k, i) => { out[k] = Math.floor(100 / s.length) + (i < 100 % s.length ? 1 : 0); });
    return out;
  }

  /** Bonus points split by a plan: { AP: 70, HV: 30 } of 159 -> { AP: 111, HV: 48 } (rounding goes to the biggest share). */
  function splitPoints(plan, have) {
    const sum = Object.values(plan).reduce((n, v) => n + v, 0);
    if (!sum || have <= 0) return {};
    const out = {};
    let given = 0;
    for (const [k, v] of Object.entries(plan)) { out[k] = Math.floor(have * v / sum); given += out[k]; }
    const order = Object.entries(plan).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    for (let i = 0; given < have; i++, given++) out[order[i % order.length]]++;
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  }

  /** Bonus points: what the character has (level − 1 unless typed in), spent, left. */
  function points(build) {
    const have = build.ptsHave != null && build.ptsHave !== "" ? clamp(build.ptsHave, 0, 9999) : Math.max(0, build.level - 1);
    const spent = STATS.reduce((n, k) => n + ((build.pts || {})[k] || 0), 0);
    return { have, spent, left: have - spent, typed: build.ptsHave != null && build.ptsHave !== "" };
  }

  /** A buff's effects from data/buffs.json: { table, group, party, needs, replaces, form, onlyFormSkills, effects } */
  function buffSpec(buffs, name) {
    const s = buffs && buffs.skills && buffs.skills[name];
    if (!s) return null;
    return {
      table: s.table || "", group: s.group || "", party: !!s.party, needs: s.needs || "", replaces: s.replaces || "",
      form: s.form || "", onlyFormSkills: !!s.onlyFormSkills, effects: s.effects || []
    };
  }

  /**
   * The ticked buffs that really work: one that needs another (Beast's Instinct needs Evolution) only
   * with it, and one replaced by another that's on (Evolution while Beast's Instinct is on) is left out.
   * Returns { active: { name: lv }, off: { name: "needs Evolution" }, replacedBy: { name: other } }
   */
  function activeBuffs(build, buffs) {
    const ticked = build.skills || {};
    const active = {}, off = {}, replacedBy = {};
    for (const [name, lv] of Object.entries(ticked)) {
      const spec = buffSpec(buffs, name);
      if (spec && spec.needs && !ticked[spec.needs]) off[name] = "needs " + spec.needs;
      else active[name] = lv;
    }
    for (const name of Object.keys(active)) {
      const spec = buffSpec(buffs, name);
      if (spec && spec.replaces && active[spec.replaces]) { replacedBy[spec.replaces] = name; delete active[spec.replaces]; }
    }
    return { active, off, replacedBy };
  }

  /**
   * The state the build is in (Evolution, Metamorphosis) and whether a skill can be used in it.
   * A skill that says "Can only be used while in Evolution state" needs that form; while a form with
   * onlyFormSkills is on (Evolution, Beast's Instinct) other attack skills can't be used.
   * Returns { form: "Evolution" | "", usable(skill) -> { ok, why } }
   */
  function formState(build, buffs) {
    const ticked = build.skills || {};
    let form = "", only = false;
    for (const name of Object.keys(activeBuffs(build, buffs).active).concat(Object.keys(ticked).filter(n => buffSpec(buffs, n) && buffSpec(buffs, n).replaces && ticked[buffSpec(buffs, n).replaces]))) {
      const spec = buffSpec(buffs, name);
      if (spec && spec.form) { form = spec.form; only = only || spec.onlyFormSkills; }
    }
    const needsForm = sk => {
      const t = `${sk.desc || ""} ${sk.notes || ""}`;
      const m = /only be used while in (\w+) state/i.exec(t);
      return m ? m[1] : /must be in a transformed state/i.test(t) ? "transformed" : "";
    };
    return {
      form,
      usable(sk) {
        const need = needsForm(sk);
        if (need && !form) return { ok: false, why: need === "transformed" ? "Only while transformed" : `Only in ${need}` };
        if (need && need !== "transformed" && form && need !== form) return { ok: false, why: `Only in ${need}` };
        if (!need && form && only) return { ok: false, why: `Can't be used in ${form}` };
        return { ok: true, why: need ? `${form} skill` : "" };
      }
    };
  }

  /** A buff's field at a skill level ("1"…"10", "M") from data/buff-values.json, or null. */
  function buffValue(values, name, field, lv) {
    const s = values && values.skills && values.skills[name];
    const row = s && s.levels && (s.levels[lv] || s.levels.M);
    const v = row ? row[field] : null;
    return Number.isFinite(v) ? v : null;
  }

  /** Change one effect makes, from the stat before buffs. */
  function effectDelta(eff, value, front, gear) {
    if (value == null) return 0;
    const of = eff.of === "base" ? front : front + gear;
    if (eff.op === "add") return Math.trunc(value);
    if (eff.op === "sub") return -Math.trunc(value);
    if (eff.op === "plus") return Math.trunc(of * value);
    if (eff.op === "minus") return -Math.trunc(of * value);
    return 0;
  }

  /**
   * The status window for a build.
   * ctx: { stats: builds.stats, base: { AP: 18, … } or null, buffs: data/buffs.json, values: data/buff-values.json }
   * Returns { rows: [{ stat, group, lv, pts, front, gear, buff, plus, total }], elements, resist,
   *           buffs: [{ name, lv, deltas: { AP: n } }], known: base is known }
   */
  function status(build, ctx) {
    const base = ctx.base || null;
    const gearSum = {}, elements = {}, resist = {};
    const add = (to, src) => { for (const [k, v] of Object.entries(src || {})) to[k] = (to[k] || 0) + v; };
    for (const s of SLOTS) {
      const g = (build.gear || {})[s.key];
      if (!g) continue;
      add(gearSum, g.st);
      const pe = pieceElements(g); // compound slots
      add(gearSum, pe.s);
      add(elements, pe.e);
      add(resist, pe.r);
    }
    const rows = STATS.map(stat => {
      const group = GROUP_OF[stat];
      const pts = (build.pts || {})[stat] || 0;
      const lv = groupLevel(build.level, build.growth[group]) + pts;
      const per = ctx.stats.perAttrLevel[stat];
      const front = base ? frontStat(base[stat] || 0, per, lv) : null;
      return { stat, group, lv, pts, per, front, gear: gearSum[stat] || 0, buff: 0 };
    });
    const by = Object.fromEntries(rows.map(r => [r.stat, r]));
    const applied = [];
    for (const [name, lv] of Object.entries(activeBuffs(build, ctx.buffs).active)) {
      const spec = buffSpec(ctx.buffs, name);
      if (!spec) continue;
      const deltas = {};
      for (const eff of spec.effects) {
        const r = by[eff.stat];
        if (!r) continue;
        const d = effectDelta(eff, buffValue(ctx.values, name, eff.field, lv), r.front || 0, r.gear);
        if (d) deltas[eff.stat] = (deltas[eff.stat] || 0) + d;
      }
      applied.push({ name, lv, deltas });
    }
    for (const b of build.buffs || []) {
      if (!b.on || !b.value) continue;
      if (ELEMENTS.includes(b.stat)) elements[b.stat] = (elements[b.stat] || 0) + b.value;
      else if (by[b.stat]) applied.push({ name: b.name, lv: "", deltas: { [b.stat]: b.value }, manual: true });
    }
    for (const a of applied) for (const [k, v] of Object.entries(a.deltas)) by[k].buff += v;
    for (const r of rows) {
      r.plus = r.gear + r.buff;
      r.total = r.front == null ? null : r.front + r.plus;
    }
    return { rows, elements, resist, buffs: applied, known: !!base };
  }

  /** Buff skills a job has (its own skills, earlier jobs first) and party buffs from the other jobs. */
  function buffLists(builds, buffs, sets) {
    const mine = [], seen = new Set();
    for (const s of sets) for (const sk of s.skills) {
      if (!buffSpec(buffs, sk.name) || seen.has(sk.name)) continue;
      seen.add(sk.name);
      mine.push({ skill: sk, job: s.job, spec: buffSpec(buffs, sk.name) });
    }
    const party = [];
    for (const [job, skills] of Object.entries(builds.skills)) for (const sk of skills) {
      if (seen.has(sk.name) || !buffSpec(buffs, sk.name)) continue;
      const spec = buffSpec(buffs, sk.name);
      if (!spec.party) continue; // only buffs a party member can cast on you
      seen.add(sk.name);
      party.push({ skill: sk, job, spec });
    }
    return { mine, party };
  }

  /** Monsters whose name has every word of the query, bosses first, then by level. */
  /**
   * What the monster picker lists, in order, as [{ m, group }]: with words typed, the matches; with
   * nothing typed, the ones I picked lately (newest first, 5) then the bosses (boss-page order).
   */
  function monOptions(list, query, bossIds, recentIds) {
    if (String(query || "").trim()) return searchMonsters(list, query, 12).map(m => ({ m, group: "" }));
    const byId = new Map((list || []).map(m => [m.id, m]));
    const out = [], seen = new Set();
    const add = (ids, group, max) => {
      for (const id of ids || []) {
        const m = byId.get(String(id));
        if (!m || seen.has(m.id) || out.filter(o => o.group === group).length >= max) continue;
        seen.add(m.id); out.push({ m, group });
      }
    };
    add(recentIds, "Recent", 5);
    add(bossIds, "Bosses", 20);
    return out;
  }

  function searchMonsters(list, query, limit) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (list || []).filter(m => words.every(w => m.n.toLowerCase().includes(w) || m.id === w))
      .sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0) || a.l - b.l || a.n.localeCompare(b.n))
      .slice(0, limit || 20);
  }

  /**
   * Hits written down from the game, kept in the build to work out the defense formula later:
   * [{ mon, mn, ml (id, name, level), skill ("Normal attack" or a skill), lv, dmg: [numbers], note, at,
   *    stats: { AP: … } (front + gear + buffs when it was written), el: { Wind: 183 } }]
   */
  function cleanHits(list) {
    return (Array.isArray(list) ? list : []).slice(0, LIMITS.hits).map(h => {
      if (!h || typeof h !== "object") return null;
      const dmg = (Array.isArray(h.dmg) ? h.dmg : []).map(v => clamp(v, 0, 99999999)).filter(v => v > 0).slice(0, LIMITS.hitNumbers);
      if (!dmg.length) return null;
      const out = {
        mon: str(h.mon, 12), mn: str(h.mn, 60), ml: clamp(h.ml, 0, 9999),
        skill: str(h.skill, 60) || "Normal attack", lv: SKILL_LEVELS.includes(String(h.lv)) ? String(h.lv) : "",
        dmg, note: str(h.note, LIMITS.note), at: clamp(h.at, 0, 9e15), stats: cleanStats(h.stats)
      };
      const el = cleanStats(h.el, ELEMENTS);
      if (Object.keys(el).length) out.el = el;
      return out;
    }).filter(Boolean);
  }

  /** "812, 795 830" -> [812, 795, 830] (anything not a number splits them). */
  function parseDamage(text) {
    return String(text || "").replace(/,(?=\d{3}\b)/g, "").split(/[^0-9]+/).map(Number).filter(v => v > 0).slice(0, LIMITS.hitNumbers);
  }

  /** The written hits as plain text to copy and send for working out the formula. */
  function hitsText(build, hits) {
    const lines = [`Trickster Companion hits · ${build.cls} ${build.job} Lv.${build.level} · growth ${Object.values(build.growth).join("-")}`];
    for (const h of hits || []) {
      const s = Object.entries(h.stats || {}).map(([k, v]) => `${k} ${v}`).join(" ");
      const el = Object.entries(h.el || {}).map(([k, v]) => `${k} ${v}%`).join(" ");
      lines.push(`${h.mn} (#${h.mon} Lv.${h.ml}) · ${h.skill}${h.lv ? " " + (h.lv === "M" ? "Master" : "Lv." + h.lv) : ""} · ${h.dmg.join(", ")}` +
        ` · stats: ${s}${el ? " · element: " + el : ""}${h.note ? " · " + h.note : ""}`);
    }
    return lines.join("\n");
  }

  const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /**
   * Compound slots of a piece: [{ k: "e:Wind" (attack element, %) | "r:Fire" (resistance, %) | "s:AP" (a stat, + points) | "", v }],
   * at most 5, empty ones kept so the slot count stays. An older piece's single element / resistance
   * (g.e, g.r) becomes slots too.
   */
  const CP_RE = new RegExp(`^([er]:(${ELEMENTS.join("|")})|s:(${STATS.join("|")}))$`);
  function cleanCompound(g) {
    let list = Array.isArray(g.cp) ? g.cp : [];
    if (!list.length) {
      for (const [k, v] of Object.entries(cleanStats(g.e, ELEMENTS))) list.push({ k: "e:" + k, v });
      for (const [k, v] of Object.entries(cleanStats(g.r, ELEMENTS))) list.push({ k: "r:" + k, v });
    }
    return list.slice(0, LIMITS.compound).map(c => {
      const k = c && CP_RE.test(c.k) ? c.k : "";
      // a stat can be minus (some compounds trade one stat for another); elements are 0-999 %
      return { k, v: k.startsWith("s:") ? clamp(c.v, -99999, 99999) : clamp(c && c.v, 0, 999) };
    });
  }

  /** What a piece's compound slots give: { e: { Wind: 126 }, r: { Fire: 10 }, s: { AP: 20 } } (elements %, stats +) */
  function pieceElements(g) {
    const e = {}, r = {}, s = {};
    for (const c of cleanCompound(g || {})) {
      if (!c.k || !c.v) continue;
      const [kind, el] = c.k.split(":");
      const to = kind === "e" ? e : kind === "r" ? r : s;
      to[el] = (to[el] || 0) + c.v;
    }
    return { e, r, s };
  }

  function cleanPiece(g) {
    if (!g || typeof g !== "object") return null;
    const p = { n: str(g.n, LIMITS.item) };
    const st = cleanStats(g.st), cp = cleanCompound(g);
    if (Object.keys(st).length) p.st = st;
    if (cp.length) p.cp = cp;
    const note = str(g.note, LIMITS.note);
    if (note) p.note = note;
    return p.n || p.st || p.cp || p.note ? p : null;
  }

  /**
   * A build from anything (saved data, cloud, an import): known fields only, sizes limited, numbers
   * whole. Returns null when it isn't a build at all.
   */
  function cleanBuild(b) {
    if (!b || typeof b !== "object") return null;
    const growth = {};
    for (const g of Object.keys(GROUP_STATS)) growth[g] = clamp(b.growth && b.growth[g], 1, 4) || 1;
    const gear = {};
    for (const s of SLOTS) { const p = cleanPiece(b.gear && b.gear[s.key]); if (p) gear[s.key] = p; }
    const pts = {}, bonus = {};
    for (const k of STATS) {
      const v = clamp(b.pts && b.pts[k], 0, 9999); if (v) pts[k] = v;
      const p = clamp(b.bonus && b.bonus[k], 0, 100); if (p) bonus[k] = p;
    }
    const skills = {};
    for (const [name, lv] of Object.entries(b.skills && typeof b.skills === "object" ? b.skills : {}).slice(0, LIMITS.skills)) {
      const n = str(name, 60);
      if (n && SKILL_LEVELS.includes(String(lv))) skills[n] = String(lv);
    }
    const buffs = (Array.isArray(b.buffs) ? b.buffs : []).slice(0, LIMITS.buffs)
      .filter(x => x && (STATS.includes(x.stat) || ELEMENTS.includes(x.stat)))
      .map(x => ({ name: str(x.name, LIMITS.name) || "Buff", stat: x.stat, value: clamp(x.value, -99999, 99999), on: !!x.on }));
    const out = {
      id: /^b[a-z0-9]{1,24}$/.test(b.id) ? b.id : newId("b"),
      name: str(b.name, LIMITS.name) || "My build",
      cls: str(b.cls, 20), job: str(b.job, 40),
      level: clamp(b.level, 1, 999) || 1,
      growth, pts, bonus, gear, skills, buffs,
      notes: str(b.notes, LIMITS.notes),
      updated: clamp(b.updated, 0, 9e15)
    };
    if (/^\d{1,9}$/.test(String(b.mon || ""))) out.mon = String(b.mon); // the monster picked in 🎯
    const hits = cleanHits(b.hits);
    if (hits.length) out.hits = hits;
    if (b.shared) out.shared = true; // friends can see it (Friends page)
    if (b.ptsHave != null && b.ptsHave !== "") out.ptsHave = clamp(b.ptsHave, 0, 9999);
    // starting stats the player typed in for a class we don't know yet
    if (b.base && typeof b.base === "object" && STATS.some(k => k in b.base)) {
      out.base = {};
      for (const k of STATS) out.base[k] = clamp(b.base[k], -99999, 99999);
    }
    return out;
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

  /** A share code for one build: "TCB2." + base64 JSON. */
  function encodeBuild(b) {
    const json = JSON.stringify(Object.assign({}, cleanBuild(b), { id: undefined, updated: undefined }));
    const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
    return "TCB2." + b64;
  }

  /** The build in a share code, as a new build (own id), or null when the code is broken. */
  function decodeBuild(code) {
    const m = /^TCB2\.([A-Za-z0-9+/=]+)$/.exec(String(code || "").replace(/\s+/g, ""));
    if (!m || m[1].length > 60000) return null;
    try {
      const json = typeof atob === "function" ? decodeURIComponent(escape(atob(m[1]))) : Buffer.from(m[1], "base64").toString("utf8");
      const b = cleanBuild(JSON.parse(json));
      if (!b) return null;
      b.id = newId("b");
      return b;
    } catch (e) { return null; }
  }

  const model = { STATS, GROUP_STATS, GROUP_OF, ELEMENTS, SLOTS, SKILL_LEVELS, LIMITS, cleanStats, groupLevel, frontStat, baseFromFront, pickBase, planOf, splitPoints, points, cleanCompound, pieceElements, buffSpec, activeBuffs, formState, searchMonsters, monOptions, cleanHits, parseDamage, hitsText, buffValue, effectDelta, status, buffLists, cleanBuild, cleanBuilds, mergeBuilds, encodeBuild, decodeBuild, newId };

  if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

  // ---------------------------------------------------------------------------------------------
  // Renderer (browser). Handlers live on TQPlanner (set up in index.html). Inputs have ids so the
  // page can put the cursor back after a re-render.
  // ---------------------------------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // a JS string inside an HTML attribute: escape for JS first, then for HTML (see build.js)
  const jsq = s => esc(String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
  const fmt = v => Math.round(v).toLocaleString();
  const sign = v => (v >= 0 ? "+" : "") + fmt(v);
  const GROUP_CLASS = { Power: "bd-power", Magic: "bd-magic", Sense: "bd-sense", Charm: "bd-charm" };
  const EL_CLASS = k => "pl-el pl-el-" + k.toLowerCase();
  // one icon per element (and the physical / gun / no-element resistances), used beside their names
  const EL_ICON = { Fire: "🔥", Water: "💧", Wind: "🌪️", Earth: "🪨", Elec: "⚡", Light: "✨", Dark: "🌑", None: "⚪", Physical: "🗡️", Gun: "🔫" };
  const RES_ORDER = ["Fire", "Water", "Wind", "Earth", "Elec", "Light", "Dark", "None", "Physical", "Gun"];

  function slotTile(s, build, ui) {
    const g = (build.gear || {})[s.key];
    const open = ui.slot === s.key;
    const stats = g && g.st ? Object.entries(g.st) : [];
    const pe = g ? pieceElements(g) : { e: {} };
    const el = Object.entries(pe.e).map(([k, v]) => `${k} ${v}%`).join(" · ");
    const cs = g ? Object.entries(pieceElements(g).s).map(([k, v]) => `${k} ${sign(v)}`).join(" · ") : "";
    const sub = g ? (stats.length ? stats.slice(0, 2).map(([k, v]) => `${k} ${sign(v)}`).join(" · ") + (stats.length > 2 ? " …" : "") : el || cs || "no stats") : "Empty";
    return `<button type="button" class="pl-tile ${g ? "is-on" : ""} ${open ? "is-open" : ""}" onclick="TQPlanner.openSlot('${s.key}')" aria-expanded="${open}" title="${esc(s.label)}${g && g.n ? ": " + esc(g.n) : ""}">
        <span class="pl-tile-icon" aria-hidden="true">${s.icon}</span>
        <span class="pl-tile-label">${g && g.n ? esc(g.n) : s.label}</span>
        <span class="pl-tile-sub">${esc(sub)}</span>
      </button>`;
  }

  function dollBox(build, ctx) {
    const side = k => SLOTS.filter(s => s.side === k).map(s => slotTile(s, build, ctx.ui)).join("");
    const worn = SLOTS.filter(s => build.gear[s.key]).length;
    return `
      <section class="bd-box pl-doll-box">
        <h4>🛡️ Equipment <span class="bd-note">${worn} / ${SLOTS.length} · tap a slot and type what the game shows</span></h4>
        <div class="pl-doll">
          <div class="pl-doll-col">${side("left")}</div>
          <div class="pl-doll-art">${ctx.art ? `<img src="${esc(ctx.art)}" alt="${esc(build.job || build.cls)}" loading="lazy">` : ""}
            <span class="pl-doll-name">${esc(build.job || build.cls)} · Lv.${build.level}</span></div>
          <div class="pl-doll-col">${side("right")}</div>
        </div>
        <div class="pl-doll-row">${side("bottom")}</div>
        ${slotEditor(build, ctx)}
      </section>`;
  }

  /** The open slot's form: name, the 12 stats (in the status window's order), compound slots, note. */
  function slotEditor(build, ctx) {
    const s = SLOTS.find(x => x.key === ctx.ui.slot);
    if (!s) return "";
    const g = build.gear[s.key] || {};
    const field = (k, v, label) => `<label class="pl-in ${GROUP_CLASS[GROUP_OF[k]] || ""}"><span>${label || k}</span>
      <input id="pl-${s.key}-${k}" type="number" step="1" inputmode="numeric" value="${v || ""}" placeholder="0" onchange="TQPlanner.gearStat('${s.key}', '${k}', this.value)"></label>`;
    // compound slots: how many, then in each an element (attack or resistance, %) or a stat (+)
    const cp = cleanCompound(g);
    const cpSel = (i, cur) => `<select id="pl-${s.key}-cp${i}" aria-label="Compound slot ${i + 1}: what it gives" onchange="TQPlanner.gearCompound('${s.key}', ${i}, 'k', this.value)">
        <option value="">Empty</option>
        <optgroup label="Attack element">${ELEMENTS.map(k => `<option value="e:${k}" ${cur === "e:" + k ? "selected" : ""}>${k}</option>`).join("")}</optgroup>
        <optgroup label="Resistance">${ELEMENTS.map(k => `<option value="r:${k}" ${cur === "r:" + k ? "selected" : ""}>${k} resistance</option>`).join("")}</optgroup>
        <optgroup label="Stat">${STATS.map(k => `<option value="s:${k}" ${cur === "s:" + k ? "selected" : ""}>${k}</option>`).join("")}</optgroup></select>`;
    const pe = pieceElements(g);
    const sumLine = [...Object.entries(pe.e).map(([k, v]) => `${k} ${v}%`), ...Object.entries(pe.r).map(([k, v]) => `${k} res ${v}%`), ...Object.entries(pe.s).map(([k, v]) => `${k} ${sign(v)}`)].join(" · ");
    return `
      <div class="pl-editor" role="group" aria-label="${s.label}">
        <div class="pl-editor-head">
          <strong>${s.icon} ${s.label}</strong>
          <span>
            ${build.gear[s.key] && !ctx.readOnly ? `<button type="button" class="btn btn-sm" onclick="TQPlanner.clearSlot('${s.key}')">Take off</button>` : ""}
            <button type="button" class="btn btn-sm" onclick="TQPlanner.openSlot('')">Done</button>
          </span>
        </div>
        <fieldset class="pl-fs" ${ctx.readOnly ? "disabled" : ""}>
        <label class="pl-in pl-in-wide"><span>Name</span><input id="pl-${s.key}-n" maxlength="${LIMITS.item}" value="${esc(g.n || "")}" placeholder="e.g. White Swan Staff +7" onchange="TQPlanner.gearField('${s.key}', 'n', this.value)"></label>
        <p class="bd-note">Type the item's stats here (Refine included). A compound slot that gives a stat goes in ◇ Compound slots below, not in these boxes, so it isn't counted twice.</p>
        <div class="pl-in-grid">${STATS.map(k => field(k, (g.st || {})[k])).join("")}</div>
        <div class="pl-cp">
          <div class="pl-cp-head">
            <label for="pl-${s.key}-cpn">◇ Compound slots</label>
            <select id="pl-${s.key}-cpn" onchange="TQPlanner.gearCompound('${s.key}', -1, 'count', this.value)">${[0, 1, 2, 3, 4, 5].map(n => `<option ${n === cp.length ? "selected" : ""}>${n}</option>`).join("")}</select>
            ${sumLine ? `<span class="pl-cp-sum">= ${esc(sumLine)}</span>` : cp.length ? `<span class="bd-note">pick an element (%) or a stat (+) in each</span>` : ""}
          </div>
          ${cp.length ? `<div class="pl-cp-list">${cp.map((c, i) => `
            <div class="pl-cp-slot ${c.k ? "is-on" : ""}">
              <span class="pl-cp-n" aria-hidden="true">${i + 1}</span>
              ${cpSel(i, c.k)}
              <span class="pl-cp-pct">${c.k.startsWith("s:") ? `<span aria-hidden="true">+</span>` : ""}<input id="pl-${s.key}-cpv${i}" type="number" ${c.k.startsWith("s:") ? "" : 'min="0"'} step="1" inputmode="numeric" value="${c.v || ""}" placeholder="0" aria-label="Compound slot ${i + 1} ${c.k.startsWith("s:") ? c.k.slice(2) : "%"}" onchange="TQPlanner.gearCompound('${s.key}', ${i}, 'v', this.value)">${c.k.startsWith("s:") ? "" : `<span aria-hidden="true">%</span>`}</span>
            </div>`).join("")}</div>` : ""}
        </div>
        <label class="pl-in pl-in-wide"><span>Note</span><input id="pl-${s.key}-note" maxlength="${LIMITS.note}" value="${esc(g.note || "")}" placeholder="Refine +7, where it drops…" onchange="TQPlanner.gearField('${s.key}', 'note', this.value)"></label>
        </fieldset>
      </div>`;
  }

  function statusBox(build, st, ctx) {
    const p = points(build);
    const cards = Object.entries(GROUP_STATS).map(([g, list]) => list.map(k => {
      const r = st.rows.find(x => x.stat === k);
      const name = ctx.stats.names[k] || k;
      return `<div class="pl-stat ${GROUP_CLASS[g]}">
          <div class="pl-stat-top"><span class="pl-stat-key" title="${esc(name)}">${k}</span><span class="pl-stat-lv">Lv.${r.lv}</span></div>
          <div class="pl-stat-val">${r.front == null ? "?" : fmt(r.front)}<span class="pl-stat-plus">${r.plus || r.front != null ? (r.plus < 0 ? "" : "+") + fmt(r.plus) : ""}</span></div>
          <div class="pl-stat-pts">
            <button type="button" class="bd-step" aria-label="One bonus point less in ${k}" onclick="TQPlanner.point('${k}', -1)" ${r.pts ? "" : "disabled"}>−</button>
            <input id="pl-pt-${k}" type="number" min="0" step="1" value="${r.pts}" aria-label="Bonus points in ${k}" onchange="TQPlanner.point('${k}', this.value, true)">
            <button type="button" class="bd-step" aria-label="One bonus point more in ${k}" onclick="TQPlanner.point('${k}', 1)">+</button>
          </div>
          ${r.gear || r.buff ? `<div class="pl-stat-from">${r.gear ? `gear ${sign(r.gear)}` : ""}${r.gear && r.buff ? " · " : ""}${r.buff ? `<span class="pl-stat-buff">buffs ${sign(r.buff)}</span>` : ""}</div>` : ""}
        </div>`;
    }).join("")).join("");
    const el = ELEMENTS.filter(k => st.elements[k] || st.resist[k]);
    return `
      <section class="bd-box pl-status">
        <div class="pl-status-head">
          <h4>📊 Status</h4>
          <label class="pl-in pl-in-inline" title="Level − 1 unless you type what the game shows (quests give extra points)"><span>Bonus points</span><input id="pl-pts-have" type="number" min="0" value="${p.have}" onchange="TQPlanner.pointsHave(this.value)"></label>
          <span class="pl-pts-left ${p.left < 0 ? "bd-warn" : ""}">${p.left >= 0 ? `${p.left} left` : `${-p.left} too many`}</span>
        </div>
        <div class="pl-stats-grid">${cards}</div>
        <p class="pl-elems"><b>Attack element</b> ${el.filter(k => st.elements[k]).map(k => `<span class="${EL_CLASS(k)}">${k} ${st.elements[k]}%</span>`).join("") || `<span class="bd-note">none</span>`}
          <b>Resistance</b> ${el.filter(k => st.resist[k]).map(k => `<span class="${EL_CLASS(k)}">${k} ${st.resist[k]}%</span>`).join("") || `<span class="bd-note">none</span>`}</p>
        ${baseNote(build, st, ctx)}
      </section>`;
  }

  /**
   * Where the starting stats come from (ctx.baseFrom): "checked" (data/stat-base.json), "mine" (the
   * player typed their window), "estimate" (another class's, until someone checks), else unknown.
   */
  function baseNote(build, st, ctx) {
    // how the numbers are made is said once, in the guide at the top of the page
    if (ctx.baseFrom === "checked") return `<p class="bd-note">✓ ${esc(build.cls)}'s starting stats are checked in game${ctx.baseChecked ? ` (${esc(ctx.baseChecked.replace(/^[\d-]+ in game: /, ""))})` : ""}.</p>`;
    if (ctx.baseFrom === "mine") return `<p class="bd-note">${esc(build.cls)}'s starting stats come from the Growth window you typed in.</p>
      ${calibrateBox(build, "Type your window again", false)}`;
    if (ctx.baseFrom === "estimate") return `
      <div class="pl-calib">
        <p><strong>Estimated:</strong> we don't know ${esc(build.cls)}'s starting stats yet, so the first numbers use ${esc(ctx.estimateFrom)}'s.
          Compare them with your Growth window; if they're off, type yours below.</p>
        ${calibrateBox(build, `Type ${build.cls}'s Growth window`, false)}
      </div>`;
    return `<div class="pl-calib"><p><strong>We don't know ${esc(build.cls)}'s starting stats yet.</strong></p>${calibrateBox(build, "Type your Growth window", true)}</div>`;
  }

  /** The player types their front numbers once and the planner works out the class's starting stats. */
  function calibrateBox(build, title, open) {
    return `
      <details class="pl-calib-form" ${open ? "open" : ""}>
        <summary>✏️ ${esc(title)}</summary>
        <p class="bd-note">Open the game's Growth window, set the level, growth and bonus points above to match, and type the
          first number of each stat (before the +).</p>
        <form class="pl-in-grid" onsubmit="event.preventDefault(); TQPlanner.calibrate(this)">
          ${STATS.map(k => `<label class="pl-in ${GROUP_CLASS[GROUP_OF[k]]}"><span>${k}</span><input name="${k}" type="number" step="1" required></label>`).join("")}
          <button type="submit" class="btn btn-sm btn-primary">Use these</button>
        </form>
        <p class="bd-note">Send us the numbers too (a screenshot of the Growth and Basic Info tabs) and we'll add ${esc(build.cls)} for everyone.</p>
      </details>`;
  }

  function buffRow(entry, build, st, act) {
    const sk = entry.skill;
    const lv = (build.skills || {})[sk.name];
    const on = !!lv;
    const spec = entry.spec;
    const note = !on ? "" : act && act.off[sk.name] ? `<span class="bd-warn">Works only with ${esc(spec.needs)} on: tick it too</span>`
      : act && act.replacedBy[sk.name] ? `<span class="bd-note">${esc(act.replacedBy[sk.name])} is on: its values are used instead</span>` : "";
    const applied = st.buffs.find(b => b.name === sk.name && !b.manual);
    const eff = applied ? Object.entries(applied.deltas).map(([k, v]) => `<span class="${v >= 0 ? "is-up" : "is-down"}">${k} ${sign(v)}</span>`).join("") : "";
    const what = entry.spec.effects.map(e => e.stat).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
    const id = "pl-sk-" + sk.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `
      <li class="pl-buff ${on ? "is-on" : ""}">
        <label class="pl-buff-main" for="${id}">
          <input id="${id}" type="checkbox" ${on ? "checked" : ""} onchange="TQPlanner.skill('${jsq(sk.name)}', this.checked ? (document.getElementById('${id}-lv').value) : '')">
          ${sk.icon ? `<img src="${esc(sk.icon)}" alt="" loading="lazy">` : `<span class="pl-buff-ph" aria-hidden="true">✨</span>`}
          <span><strong>${esc(sk.name)}</strong> <span class="bd-note">${esc(entry.job)} · ${esc(what)}${spec.needs ? ` · with ${esc(spec.needs)}` : spec.group ? " · transform" : ""}</span></span>
        </label>
        <select id="${id}-lv" aria-label="${esc(sk.name)} level" onchange="TQPlanner.skill('${jsq(sk.name)}', document.getElementById('${id}').checked ? this.value : '', true)">
          ${SKILL_LEVELS.map(l => `<option value="${l}" ${l === (lv || "M") ? "selected" : ""}>${l === "M" ? "Master" : "Lv." + l}</option>`).join("")}
        </select>
        ${on ? `<span class="pl-diff">${note || eff || `<span class="bd-note">no change</span>`}</span>` : ""}
      </li>`;
  }

  function buffBox(build, st, ctx) {
    const lists = ctx.buffLists;
    const partyOn = lists.party.filter(e => build.skills[e.skill.name]).length;
    const act = activeBuffs(build, ctx.buffs);
    const manual = build.buffs;
    const opts = sel => [...STATS, ...ELEMENTS].map(k => `<option ${k === sel ? "selected" : ""}>${k}</option>`).join("");
    return `
      <section class="bd-box pl-buffs">
        <h4>✨ Buffs <span class="bd-note">tick to add them to the status</span></h4>
        ${lists.mine.length ? `<ul class="pl-buff-list">${lists.mine.map(e => buffRow(e, build, st, act)).join("")}</ul>`
          : `<p class="bd-note">${esc(build.job || build.cls)} has no stat buffs we know of.</p>`}
        <details class="pl-party" ${partyOn ? "open" : ""}>
          <summary>👥 Party buffs from other jobs ${partyOn ? `<span class="tag">${partyOn} on</span>` : ""}</summary>
          <ul class="pl-buff-list">${lists.party.map(e => buffRow(e, build, st, act)).join("")}</ul>
        </details>
        <details class="pl-party" ${manual.length ? "open" : ""}>
          <summary>✏️ Other buffs, typed in ${manual.length ? `<span class="tag">${manual.filter(b => b.on).length} on</span>` : ""}</summary>
          <ul class="pl-manual">${manual.map((b, i) => `
            <li><input type="checkbox" ${b.on ? "checked" : ""} aria-label="Use ${esc(b.name)}" onchange="TQPlanner.buff(${i}, 'on', this.checked)">
              <input id="pl-bf-${i}-n" value="${esc(b.name)}" maxlength="${LIMITS.name}" aria-label="Buff name" onchange="TQPlanner.buff(${i}, 'name', this.value)">
              <select aria-label="Stat" onchange="TQPlanner.buff(${i}, 'stat', this.value)">${opts(b.stat)}</select>
              <input id="pl-bf-${i}-v" type="number" value="${b.value}" aria-label="Value" onchange="TQPlanner.buff(${i}, 'value', this.value)">
              <button type="button" class="btn btn-sm" aria-label="Remove ${esc(b.name)}" onclick="TQPlanner.buff(${i}, 'remove')">✕</button></li>`).join("")}</ul>
          ${manual.length < LIMITS.buffs ? `<button type="button" class="btn btn-sm" onclick="TQPlanner.buff(-1, 'add')">＋ Add a buff</button>` : ""}
        </details>
        <p class="bd-note">Values from the PlayTrickster client's skill tables, not checked in game yet. If a number is off, tell us what the game shows.</p>
      </section>`;
  }

  /** My builds as tabs, and what can be done with the open one. */
  function buildsBar(build, ctx) {
    const list = ctx.saved || [];
    if (ctx.readOnly) return `
      <section class="bd-box pl-bar pl-bar-friend">
        <p><strong>👥 ${esc(ctx.readOnly.friend)}'s build: ${esc(build.name)}</strong> <span class="bd-note">read only</span></p>
        <div class="pl-save-row">
          <button type="button" class="btn btn-sm btn-primary" onclick="TQPlanner.copyViewed()" ${list.length >= LIMITS.builds ? "disabled" : ""}>📋 Copy to my builds</button>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.closeViewed()">Close</button>
        </div>
      </section>`;
    return `
      <section class="bd-box pl-bar">
        <div class="pl-tabs" role="tablist" aria-label="My builds">
          ${list.map(b => `<button type="button" role="tab" class="pl-tab ${b.id === build.id ? "is-on" : ""}" aria-selected="${b.id === build.id}" onclick="TQPlanner.open('${b.id}')">
              <strong>${esc(b.name)}</strong><span>${esc(b.job || b.cls)} · Lv.${b.level}${b.shared ? " · 👥" : ""}</span></button>`).join("")}
          ${list.length < LIMITS.builds ? `<button type="button" class="pl-tab pl-tab-new" onclick="TQPlanner.newBuild()">＋ New build</button>` : ""}
        </div>
        <div class="pl-save-row">
          <input id="plName" value="${esc(build.name)}" maxlength="${LIMITS.name}" aria-label="Build name" onchange="TQPlanner.set({ name: this.value })">
          <label class="pl-share"><input type="checkbox" ${build.shared ? "checked" : ""} onchange="TQPlanner.set({ shared: this.checked })"> 👥 Friends can see it</label>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.duplicate()" ${list.length >= LIMITS.builds ? "disabled" : ""}>Duplicate</button>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.share()">🔗 Share code</button>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.importCode()">📥 Open a code</button>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.remove('${build.id}')">🗑 Delete</button>
        </div>
        ${ctx.ui.code ? `<div class="pl-code"><textarea readonly rows="3" aria-label="Share code" onclick="this.select()">${esc(ctx.ui.code)}</textarea><p class="bd-note">Copy this and send it to anyone; they open it with 📥 Open a code.</p></div>` : ""}
        <p class="bd-note">${list.length} / ${LIMITS.builds} builds · ${ctx.signedIn ? "saved and synced with your account" : "saved on this device (sign in to sync)"}. Changes save as you go.</p>
      </section>`;
  }

  const samePlan = (a, b) => { const ka = Object.keys(a).filter(k => a[k]), kb = Object.keys(b).filter(k => b[k]); return ka.length === kb.length && ka.every(k => a[k] === b[k]); };

  /** Class, job, level and growth of the build, and how to raise stats beside them. */
  function headBox(build, ctx) {
    const classes = Object.keys(ctx.classes || {});
    const jobs = ((ctx.classes || {})[build.cls] || { jobs: [] }).jobs;
    const adv = ctx.advice || { label: "", why: "", stats: [] };
    // my own plan for the bonus points (build.bonus, % per stat); the suggestion until I change it
    const mine = Object.keys(build.bonus || {}).length > 0;
    const plan = planOf(build, adv);
    const sum = Object.values(plan).reduce((n, v) => n + v, 0);
    const planRows = Object.entries(plan).map(([k, v]) => `
      <span class="pl-plan-item ${GROUP_CLASS[GROUP_OF[k]]}"><b>${k}</b>
        <input id="pl-plan-${k}" type="number" min="0" max="100" step="5" value="${v}" aria-label="${k} share of bonus points, %" onchange="TQPlanner.plan('${k}', this.value)">%
        <button type="button" class="bd-step" aria-label="Take ${k} out of the plan" onclick="TQPlanner.plan('${k}', 0)">✕</button></span>`).join("");
    const addable = STATS.filter(k => !(k in plan));
    return `
      <section class="bd-profile bd-compact">
        <div class="bd-compact-main">
          <div class="pl-pick">
            <label class="pl-in"><span>Class</span><select id="pl-cls" onchange="TQPlanner.set({ cls: this.value, job: '' })">${classes.map(c => `<option ${c === build.cls ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
            <label class="pl-in"><span>Job</span><select id="pl-job" onchange="TQPlanner.set({ job: this.value })">${jobs.map(j => `<option ${j.name === build.job ? "selected" : ""}>${esc(j.name)}</option>`).join("")}</select></label>
            <label class="pl-in pl-in-lv"><span>Level</span><input id="pl-level" type="number" min="1" max="999" value="${build.level}" onchange="TQPlanner.set({ level: this.value })"></label>
          </div>
          ${ctx.growthChart ? ctx.growthChart(build.growth, "TQPlanner.growth") : ""}
          <button type="button" class="btn btn-sm pl-skills-link" onclick="TQPlanner.showSkills()">📖 ${esc(build.job || build.cls)} skills in the guide</button>
        </div>
        <div class="bd-compact-guide">
          <h4>🧭 How to raise stats</h4>
          <div class="pl-plan">
            <p class="bd-compact-label">${mine ? "My plan" : "Plan"} <span class="bd-note ${sum !== 100 ? "bd-warn" : ""}">${sum}%${sum !== 100 ? " · make it 100%" : ""}</span>${mine ? "" : ` <span class="bd-note">· the suggestion below until you change it</span>`}</p>
            ${sum ? `<div class="pl-plan-bar" role="img" aria-label="Bonus points: ${esc(Object.entries(plan).map(([k, v]) => `${k} ${v}%`).join(", "))}">${Object.entries(plan).map(([k, v]) => `
              <span class="${GROUP_CLASS[GROUP_OF[k]]}" style="flex:${v}"><b>${k}</b> ${v}%</span>`).join("")}</div>` : ""}
            ${ctx.readOnly ? (build.notes ? `<p class="pl-plan-note-text">📝 ${esc(build.notes)}</p>` : "") : `
            <label class="pl-plan-note"><span>📝 Note</span>
              <textarea id="pl-notes" rows="2" maxlength="${LIMITS.notes}" placeholder="Why this plan, when to change it (e.g. AP first, HV after Lv.200)" title="Friends see it on a shared build" onchange="TQPlanner.notes(this.value)">${esc(build.notes || "")}</textarea></label>
            <details class="pl-plan-edit" ${ctx.ui.planEdit ? "open" : ""} ontoggle="TQPlanner.planEdit(this.open)">
            <summary>Change the plan</summary>
            <div class="pl-plan-row">${planRows}
              ${addable.length ? `<select id="pl-plan-add" aria-label="Add a stat to the plan" onchange="if (this.value) TQPlanner.plan(this.value, 10)">
                <option value="">＋ Add a stat</option>${addable.map(k => `<option>${k}</option>`).join("")}</select>` : ""}
            </div>
            </details>
            <div class="pl-plan-row">
              <button type="button" class="btn btn-sm btn-primary" onclick="TQPlanner.usePlan()" ${sum > 0 ? "" : "disabled"}>Put my bonus points by this plan</button>
            </div>`}
          </div>
          ${adv.label ? `<p class="pl-suggest">💡 <span class="bd-note">The skills suggest</span> <b>${esc(adv.label)}</b>${mine && !samePlan(plan, planOf({ bonus: {} }, adv)) ? ` <button type="button" class="btn btn-sm pl-suggest-use" onclick="TQPlanner.plan('', 'reset')">Use the suggestion</button>` : ""}
            <span class="bd-note">· ${esc(adv.why)}</span></p>` : ""}
          <details class="pl-howto-more">
            <summary>How stats grow</summary>
            <ul class="bd-howto">
              <li>Every level, growth raises each stat of a group: a <b>4</b> gives 1 stat level per level, a <b>1</b> one per 4 levels.</li>
              <li>Bonus points you place yourself: press <b>+</b> on a stat below. One point = one stat level (AP +4, HP +30, MP +30, WT +80, DP +4, MD +4; AC, MA, DA, LK, HV +1 per 4).</li>
              <li>The first number is starting stats + levels + bonus points, the <b>+</b> is gear and buffs, like the game's Growth window.</li>
            </ul>
            <p class="bd-note">The suggestion comes from the wiki's skill formulas, not from players. Check a guide or ask your guild.</p>
          </details>
        </div>
      </section>`;
  }

  /**
   * The 🛠️ Planner page.
   * ctx: { build, saved (my builds), readOnly: { friend } when it's a friend's build, classes (builds.json),
   *        advice, stats (builds.stats), base, baseFrom, baseChecked, estimateFrom, buffs, values, buffLists,
   *        art, signedIn, ui: { slot, code } }
   */
  function render(ctx) {
    const build = ctx.build;
    if (!build) return `
      <section class="bd-box pl-empty">
        <h3>🛠️ Build planner</h3>
        <p>Plan a character: gear in every slot, bonus points, buffs, and the status window worked out like the game's.
          Make as many builds as you like (up to ${LIMITS.builds}) and let friends see the ones you choose.</p>
        <button type="button" class="btn btn-primary" onclick="TQPlanner.newBuild()">＋ Make my first build</button>
        <button type="button" class="btn" onclick="TQPlanner.importCode()">📥 Open a code</button>
      </section>`;
    const st = status(build, ctx);
    // a friend's build: everything shows, nothing changes (slots still open to read)
    const lock = ctx.readOnly ? "disabled" : "";
    // left: what the character wears and the status it makes; right: the fight and the buffs
    return `
      ${buildsBar(build, ctx)}
      <fieldset class="pl-fs" ${lock}>${headBox(build, ctx)}</fieldset>
      <div class="pl-grid">
        <div class="pl-col">
          ${dollBox(build, ctx)}
          <fieldset class="pl-fs" ${lock}>${statusBox(build, st, ctx)}</fieldset>
        </div>
        <div class="pl-col">
          ${battleBox(build, st, ctx)}
          <fieldset class="pl-fs" ${lock}>${buffBox(build, st, ctx)}</fieldset>
        </div>
      </div>
      ${powerBox(build, st, ctx)}`;
  }

  /**
   * 💥 How hard each attack skill of the job hits with this build's stats (gear and buffs in),
   * from the wiki's formula and level table, before the monster's defense.
   */
  /** Stats as the game uses them: front + gear + buffs. */
  function totalsOf(st) {
    const totals = {};
    for (const r of st.rows) totals[r.stat] = (r.front == null ? 0 : r.front) + r.plus;
    return totals;
  }

  /** Every attack skill of the job with its power at the picked level: { rows, unread, form } */
  function powerRows(build, st, ctx) {
    const F = ctx.formula;
    const totals = totalsOf(st);
    // every skill's picked level (Master unless changed), for formulas that use another skill's level
    const levels = {};
    for (const set of ctx.skillSets) for (const sk of set.skills) levels[sk.name] = (ctx.ui.power || {})[sk.name] || "M";
    const others = F.skillLevelVars ? F.skillLevelVars(levels) : {};
    const form = formState(build, ctx.buffs);
    const seen = new Set(), rows = [], unread = [];
    for (const set of ctx.skillSets.slice().reverse()) for (const sk of set.skills) {
      if (seen.has(sk.name) || !/on\/off/i.test(sk.type || "") || !sk.formula) continue;
      seen.add(sk.name);
      const lv = levels[sk.name];
      const parts = F.evalFormula(sk.formula, F.formulaVars(totals, st.elements, sk.levels, lv, others));
      (parts.length ? rows : unread).push({ sk, job: set.job, lv, parts, use: form.usable(sk) });
    }
    // skills that can be used in the build's state (Evolution on or off) first, the others greyed below
    rows.sort((a, b) => (b.use.ok ? 1 : 0) - (a.use.ok ? 1 : 0));
    return { rows, unread, form };
  }

  function powerBox(build, st, ctx) {
    if (!ctx.formula || !ctx.skillSets) return "";
    const { rows, unread, form } = powerRows(build, st, ctx);
    if (!rows.length && !unread.length) return "";
    const lvSel = (name, lv) => `<select aria-label="${esc(name)} level" onchange="TQPlanner.powerLevel('${jsq(name)}', this.value)">${SKILL_LEVELS.map(l => `<option value="${l}" ${l === lv ? "selected" : ""}>${l === "M" ? "Master" : "Lv." + l}</option>`).join("")}</select>`;
    return `
      <section class="bd-box pl-power">
        <h4>💥 Skill power <span class="bd-note">with this build's stats, gear and buffs, before the monster's defense</span></h4>
        ${form.form ? `<p class="pl-form-note">🐾 In <b>${esc(form.form)}</b> (ticked in Buffs): its own skills are on top, the ones you can't use in it are greyed out.</p>` : ""}
        <ul class="pl-power-list">${rows.map(r => `
          <li class="pl-power-row ${r.use.ok ? "" : "is-off"}">
            <span class="pl-power-name">${r.sk.icon ? `<img src="${esc(r.sk.icon)}" alt="" loading="lazy">` : ""}<strong>${esc(r.sk.name)}</strong> <span class="bd-note">${esc(r.job)}</span>
              ${r.use.why ? `<span class="pl-power-tag ${r.use.ok ? "" : "is-off"}">${esc(r.use.why)}</span>` : ""}</span>
            ${lvSel(r.sk.name, r.lv)}
            <span class="pl-power-vals">${r.parts.map(p => `<span class="pl-power-val" title="${esc(p.text)}">${p.label ? `<span class="bd-note">${esc(p.label)}</span> ` : ""}<b>${fmt(p.value)}</b></span>`).join("")}</span>
            <code class="pl-power-f">${esc(r.sk.formula)}</code>
          </li>`).join("")}</ul>
        ${unread.length ? `<details class="pl-party"><summary>❔ ${unread.length} skill${unread.length === 1 ? "" : "s"} we can't work out yet</summary>
          <ul class="pl-power-list">${unread.map(r => `<li class="pl-power-row"><span class="pl-power-name"><strong>${esc(r.sk.name)}</strong></span><code class="pl-power-f">${esc(r.sk.formula)}</code></li>`).join("")}</ul></details>` : ""}
        <p class="bd-note">Formulas and level values from the wiki. The monster's DP / MD, elements and critical hits aren't in yet: that needs damage numbers checked in game.</p>
      </section>`;
  }

  const WIKI_IMG = "https://wikimirror.lifeto.co/asset.103.ggftw.net/wiki/to-w/images/";
  /** The monster's wiki picture: the big .png, else the .gif sprite, else nothing. */
  function monImg(m, cls) {
    // a boss with a 👑 Bosses page: that page's picture (the guessed wiki file isn't there for every boss)
    if (m.pic) return `<img class="${cls}" src="${esc(m.pic)}" alt="${esc(m.n)}" loading="lazy" onerror="this.remove()">`;
    const [a, b] = m.img || [];
    if (!a) return "";
    return `<img class="${cls}" src="${esc(WIKI_IMG + a)}" ${b ? `data-alt="${esc(WIKI_IMG + b)}"` : ""} alt="${esc(m.n)}" loading="lazy"
      onerror="if (this.dataset.alt) { this.src = this.dataset.alt; this.dataset.alt = ''; } else { this.remove(); }">`;
  }

  /**
   * The attacks the Battle Summary can pick: a normal hit (AP, before defense) and the job's attack
   * skills that can be used in the build's state, with their power.
   */
  function attacks(build, st, ctx) {
    const totals = totalsOf(st);
    const { rows } = ctx.formula && ctx.skillSets ? powerRows(build, st, ctx) : { rows: [] };
    const list = [{ name: "Normal attack", lv: "", parts: [{ label: "", text: "AP", value: totals.AP || 0 }], use: { ok: true, why: "" }, normal: true }];
    for (const r of rows) list.push({ name: r.sk.name, lv: r.lv, parts: r.parts, use: r.use, sk: r.sk });
    return list;
  }
  /** A boss's HP to beat: each HP bar × how many it has (Tombeth 6,845 × 4). */
  const monsterHp = m => m.hp * (m.bars || 1);
  const hpText = m => (m.bars ? `${fmt(m.hp)} × ${m.bars} = ${fmt(monsterHp(m))}` : fmt(m.hp));
  const strongest = a => Math.max(0, ...a.parts.map(p => p.value));

  /**
   * ⚔️ Battle Summary: a monster against one attack of the build (and a table of several monsters).
   * Before the monster's defense, so hits are the fewest it could take; the hits written down from the
   * game (📝) are for working out the defense formula.
   */
  /** A monster's card: picture, level, own element, stats (HP × bars) and resistance meters. Used by the
   *  Battle Summary and the 👑 Bosses page. */
  function monsterCard(mon) {
    // resistances as a grid of meters (0-100), one colour and icon per element, the highest stands out
    const resList = RES_ORDER.filter(k => (mon && mon.res || {})[k] != null);
    const maxRes = Math.max(0, ...resList.map(k => mon.res[k]));
    return `
      <div class="pl-bs-mon">
        <div class="pl-bs-mon-top">
          ${monImg(mon, "pl-mon-pic")}
          <div class="pl-bs-mon-info">
            <p class="pl-bs-name"><strong>${esc(mon.n)}</strong> <span class="ep-lv">Lv.${mon.l}</span>${mon.boss ? ` <span class="tag pl-boss">👑 Boss</span>` : ""}</p>
            <p class="pl-bs-own">${Object.entries(mon.el || {}).map(([k, v]) => `<span class="${EL_CLASS(k)} pl-el-big">${EL_ICON[k] || ""} ${k} ${v}%</span>`).join("") || `<span class="pl-el pl-el-none">⚪ No element</span>`}</p>
            <dl class="pl-bs-stats">
              <dt>HP</dt><dd class="is-hp" title="${mon.bars ? `${mon.bars} HP bars of ${fmt(mon.hp)}` : ""}">${hpText(mon)}</dd><dt>DP</dt><dd>${fmt(mon.dp)}</dd><dt>MD</dt><dd>${fmt(mon.md)}</dd>
              <dt>HV</dt><dd>${fmt(mon.hv)}</dd><dt>AC</dt><dd>${fmt(mon.ac)}</dd><dt>AP</dt><dd>${fmt(mon.ap)}</dd>
              <dt>MA</dt><dd>${fmt(mon.ma)}</dd><dt>LK</dt><dd>${fmt(mon.lk)}</dd>
            </dl>
          </div>
        </div>
        ${resList.length ? `<div class="pl-res">
          <p class="pl-res-title">🛡️ Resists</p>
          <ul class="pl-res-grid">${resList.map(k => `
            <li class="pl-res-item pl-res-${k.toLowerCase()} ${mon.res[k] === maxRes ? "is-max" : ""}" title="${esc(k)} resistance ${mon.res[k]}">
              <span class="pl-res-icon" aria-hidden="true">${EL_ICON[k] || ""}</span>
              <span class="pl-res-name">${esc(k)}</span>
              <b class="pl-res-val">${mon.res[k]}</b>
              <span class="pl-res-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, mon.res[k]))}%"></span></span>
            </li>`).join("")}</ul>
        </div>` : ""}
      </div>`;
  }

  function battleBox(build, st, ctx) {
    if (!ctx.monsters) return `<section class="bd-box pl-battle"><h4>⚔️ Battle Summary</h4><p class="bd-note">Loading monsters…</p></section>`;
    const list = ctx.monsters.monsters || [];
    const byId = new Map(list.map(m => [m.id, m]));
    const mon = byId.get(build.mon) || null;
    const atks = attacks(build, st, ctx);
    const usable = atks.filter(a => a.use.ok);
    const atk = usable.find(a => a.name === ctx.ui.attack) || usable[0];
    const dmg = strongest(atk);
    const opts = ctx.ui.monOpen ? monOptions(list, ctx.ui.monQuery, ctx.bossMons, ctx.recentMons) : [];
    const active = Math.min(ctx.ui.monActive || 0, Math.max(0, opts.length - 1));
    const sk = atk.sk;
    const row = sk && sk.levels && sk.levels.rows.length ? (atk.lv === "M" ? sk.levels.rows[sk.levels.rows.length - 1] : sk.levels.rows.find(r => r[0] === atk.lv) || sk.levels.rows[sk.levels.rows.length - 1]) : null;
    const col = re => { if (!row) return ""; const i = sk.levels.cols.findIndex(c => re.test(c)); return i > 0 ? row[i] : ""; };
    const myEl = Object.entries(st.elements).map(([k, v]) => `<span class="${EL_CLASS(k)}">${EL_ICON[k] || ""} ${k} ${v}%</span>`).join("") || `<span class="bd-note">none</span>`;
    const hits = m => (dmg > 0 ? Math.ceil(monsterHp(m) / dmg) : "–");
    const cmp = (ctx.ui.compare || []).map(id => byId.get(id)).filter(Boolean);

    const pickRow = `
      <div class="pl-bs-pick">
        <div class="pl-bs-find pl-mon-pick">
          <span class="pl-bs-label">Monster</span>
          ${mon ? `<span class="pl-mon-chip">${monImg(mon, "pl-mon-thumb")}<strong>${esc(mon.n)}</strong> <span class="ep-lv">Lv.${mon.l}</span>
            <button type="button" class="bd-step" aria-label="Clear the monster" onclick="TQPlanner.pickMonster('')">✕</button></span>` : ""}
          <span class="pl-mon-search">
            <input type="search" id="pl-mon-q" autocomplete="off" role="combobox" aria-expanded="${opts.length ? "true" : "false"}" aria-controls="pl-mon-options"
              ${opts.length ? `aria-activedescendant="pl-mon-opt-${active}"` : ""}
              value="${esc(ctx.ui.monQuery || "")}" placeholder="${mon ? "Change monster…" : "Pick a monster or boss…"}" aria-label="Find a monster"
              oninput="TQPlanner.monQuery(this.value)" onfocus="TQPlanner.monOpen(true)" onclick="TQPlanner.monOpen(true)" onblur="TQPlanner.monOpen(false)" onkeydown="TQPlanner.monKey(event)">
            ${opts.length ? `<ul class="pl-mon-list" id="pl-mon-options" role="listbox" onmousedown="event.preventDefault()">${opts.map((o, i) => `
              ${o.group && (i === 0 || opts[i - 1].group !== o.group) ? `<li class="pl-mon-group" role="presentation">${o.group === "Recent" ? "🕘 Picked lately" : "👑 Bosses"}</li>` : ""}
              <li role="option" id="pl-mon-opt-${i}" aria-selected="${i === active}"><button type="button" tabindex="-1" class="${i === active ? "is-active" : ""}" onclick="TQPlanner.pickMonster('${esc(o.m.id)}')">
                ${monImg(o.m, "pl-mon-thumb")}<strong>${esc(o.m.n)}</strong> <span class="ep-lv">Lv.${o.m.l}</span>${o.m.boss && o.group !== "Bosses" ? ` <span class="tag">Boss</span>` : ""}
                <span class="bd-note">HP ${hpText(o.m)} · DP ${fmt(o.m.dp)} · MD ${fmt(o.m.md)}</span></button></li>`).join("")}</ul>`
            : ctx.ui.monOpen && ctx.ui.monQuery ? `<p class="bd-note pl-mon-none">No monster called “${esc(ctx.ui.monQuery)}”.</p>` : ""}
          </span>
        </div>
        <div class="pl-bs-find">
          <span class="pl-bs-label">Attack</span>
          <select id="pl-atk" aria-label="Attack" onchange="TQPlanner.attack(this.value)">${usable.map(a => `<option ${a === atk ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
          ${atk.normal ? "" : `<select id="pl-atk-lv" aria-label="${esc(atk.name)} level" onchange="TQPlanner.powerLevel('${jsq(atk.name)}', this.value)">${SKILL_LEVELS.map(l => `<option value="${l}" ${l === atk.lv ? "selected" : ""}>${l === "M" ? "Master" : "Lv." + l}</option>`).join("")}</select>`}
        </div>
      </div>`;

    const monSide = mon ? monsterCard(mon) : `<p class="bd-note pl-bs-empty">Find a monster above to see it here.</p>`;

    const atkSide = `
      <div class="pl-bs-atk">
        <dl class="pl-bs-stats">
          <dt>Type</dt><dd>${atk.normal ? "Normal hit" : esc(sk.type || "Skill")}</dd>
          <dt>Element</dt><dd>${myEl}</dd>
          ${col(/^MP$/i) ? `<dt>MP</dt><dd>${esc(col(/^MP$/i))}</dd>` : ""}
          ${col(/cool/i) ? `<dt>Cooldown</dt><dd>${esc(col(/cool/i))}</dd>` : ""}
        </dl>
        <div class="pl-bs-result">
          ${atk.parts.map(p => `<p><span class="bd-note">${esc(p.label || (atk.normal ? "Damage (AP)" : "Damage"))}</span> <b>${fmt(p.value)}</b></p>`).join("")}
          ${mon ? `<p><span class="bd-note">Hits to kill</span> <b class="is-hits">≥ ${hits(mon)}</b></p>` : ""}
        </div>
        <code class="pl-power-f">${atk.normal ? "Normal hit: your AP (how the game turns it into damage isn't checked yet)" : esc(sk.formula)}</code>
      </div>`;

    const table = `
      <div class="pl-bs-cmp">
        <div class="pl-bs-cmp-head">
          <strong>Compare monsters</strong>
          <input type="search" id="pl-cmp-q" autocomplete="off" value="${esc(ctx.ui.cmpQuery || "")}" placeholder="＋ Add a monster" aria-label="Add a monster to compare" oninput="TQPlanner.cmpQuery(this.value)">
        </div>
        ${ctx.ui.cmpQuery ? `<ul class="pl-mon-list">${searchMonsters(list, ctx.ui.cmpQuery, 8).map(m => `<li><button type="button" onclick="TQPlanner.compare('${esc(m.id)}', true)">
          <strong>${esc(m.n)}</strong> <span class="ep-lv">Lv.${m.l}</span> <span class="bd-note">HP ${hpText(m)} · DP ${fmt(m.dp)}</span></button></li>`).join("")}</ul>` : ""}
        ${cmp.length || mon ? `<div class="bd-lvtable-wrap"><table class="pl-bs-table">
          <thead><tr><th>Monster</th><th>Lv</th><th>HP</th><th>DP</th><th>MD</th><th>${esc(atk.name)}</th><th>Hits ≥</th><th></th></tr></thead>
          <tbody>${[...(mon ? [mon] : []), ...cmp.filter(m => m !== mon)].map(m => `<tr class="${m === mon ? "is-on" : ""}">
            <td><button type="button" class="pl-bs-link" onclick="TQPlanner.pickMonster('${esc(m.id)}')">${esc(m.n)}</button>${m.boss ? ` <span class="tag">Boss</span>` : ""}</td>
            <td>${m.l}</td><td>${fmt(monsterHp(m))}${m.bars ? ` <span class="bd-note">(×${m.bars})</span>` : ""}</td><td>${fmt(m.dp)}</td><td>${fmt(m.md)}</td><td>${fmt(dmg)}</td><td><b>${hits(m)}</b></td>
            <td>${m === mon ? "" : `<button type="button" class="btn btn-sm" aria-label="Take ${esc(m.n)} out" onclick="TQPlanner.compare('${esc(m.id)}', false)">✕</button>`}</td></tr>`).join("")}</tbody>
        </table></div>` : ""}
      </div>`;

    const log = hitLog(build, mon, usable, ctx);
    return `
      <section class="bd-box pl-battle">
        <h4>⚔️ Battle Summary <span class="bd-note">before the monster's defense</span></h4>
        ${pickRow}
        <div class="pl-bs-body">${monSide}${atkSide}</div>
        ${table}
        ${log}
        <p class="bd-note">"≥" because the monster's DP / MD, elements and critical hits aren't taken into account yet: the real number of hits is the same or more.
          Monsters from the PlayTrickster client; pictures from the wiki.</p>
      </section>`;
  }

  /** 📝 Hits written down from the game, to work out the defense formula. */
  function hitLog(build, mon, usable, ctx) {
    const hits = build.hits || [];
    return `
      <details class="pl-hits" ${hits.length || ctx.ui.logOpen ? "open" : ""} ontoggle="TQPlanner.logOpen(this.open)">
        <summary>📝 Hits from the game <span class="bd-note">${hits.length} written down</span></summary>
        <p class="bd-note">To work out the defense formula: hit a monster with one attack (normal attacks first), write down 5-10
          damage numbers (not critical hits), and do it on 2-3 monsters with different DP. Your stats right now are saved with each line.</p>
        ${ctx.readOnly ? "" : mon ? `<form class="pl-hit-form" onsubmit="event.preventDefault(); TQPlanner.addHit(this)">
          <label class="pl-in"><span>Attack</span><select name="skill">${usable.map(a => `<option ${a.name === ctx.ui.attack ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label class="pl-in"><span>Skill level</span><select name="lv"><option value="">–</option>${SKILL_LEVELS.map(l => `<option value="${l}">${l === "M" ? "Master" : "Lv." + l}</option>`).join("")}</select></label>
          <label class="pl-in pl-in-wide"><span>Damage numbers on ${esc(mon.n)}</span><input name="dmg" required placeholder="812 795 830 806 …" inputmode="numeric"></label>
          <label class="pl-in pl-in-wide"><span>Note</span><input name="note" maxlength="${LIMITS.note}" placeholder="no buffs, Evolution on, a critical hit was 1,640…"></label>
          <button type="submit" class="btn btn-sm btn-primary">Save these hits</button>
        </form>` : `<p class="bd-note">Pick the monster first.</p>`}
        ${hits.length ? `<ul class="pl-hit-list">${hits.map((h, i) => `
          <li><span><strong>${esc(h.mn)}</strong> <span class="ep-lv">Lv.${h.ml}</span> · ${esc(h.skill)}${h.lv ? " " + (h.lv === "M" ? "Master" : "Lv." + h.lv) : ""}</span>
            <span class="pl-hit-dmg">${h.dmg.map(fmt).join(", ")}</span>
            <span class="bd-note">AP ${fmt((h.stats || {}).AP || 0)}${h.note ? " · " + esc(h.note) : ""}</span>
            ${ctx.readOnly ? "" : `<button type="button" class="btn btn-sm" aria-label="Delete this line" onclick="TQPlanner.removeHit(${i})">✕</button>`}</li>`).join("")}</ul>
          <button type="button" class="btn btn-sm" onclick="TQPlanner.copyHits()">📋 ${ctx.ui.hitsText ? "Hide the text" : "Text to send for working out"}</button>
          ${ctx.ui.hitsText ? `<textarea class="pl-hits-text" readonly rows="6" onclick="this.select()">${esc(hitsText(build, hits))}</textarea>` : ""}` : ""}
      </details>`;
  }

  root.TQPlanner = Object.assign({ render, monsterCard, monsterHp, hpText }, model);
})(typeof window !== "undefined" ? window : globalThis);

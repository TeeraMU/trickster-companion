// Checks js/planner.js (Build planner model) against the game's status windows and the data files.
// usage: node scripts/test-planner.js
const assert = require("assert");
const path = require("path");
const P = require("../js/planner.js");
const B = require("../js/build.js");
const data = f => require(path.join(__dirname, "..", "data", f));
const builds = data("builds.json"), buffs = data("buffs.json"), values = data("buff-values.json"), bases = data("stat-base.json");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok ", name); };
const skillByName = new Map();
for (const list of Object.values(builds.skills)) for (const s of list) if (!skillByName.has(s.name)) skillByName.set(s.name, s);
const ctx = { stats: builds.stats, base: bases.classes.Cat, buffs, values };
const front = st => Object.fromEntries(st.rows.map(r => [r.stat, r.front]));
const lvs = st => Object.fromEntries(st.rows.map(r => [r.stat, r.lv]));

// Cat / Primadonna, growth Power 4 · Magic 1 · Sense 1 · Charm 4 (player's Growth windows, 2026-11)
const cat = (level, ap) => P.cleanBuild({ cls: "Cat", job: "Primadonna", level, growth: { Power: 4, Magic: 1, Sense: 1, Charm: 4 }, pts: { AP: ap } });

t("stat levels: growth 4 = level, growth 1 = a quarter (Lv.146 -> 37)", () => {
  assert.strictEqual(P.groupLevel(160, 4), 160);
  assert.strictEqual(P.groupLevel(160, 1), 40);
  assert.strictEqual(P.groupLevel(152, 1), 38);
  assert.strictEqual(P.groupLevel(146, 1), 37);
  assert.deepStrictEqual(lvs(P.status(cat(160, 157), ctx)), { AP: 317, AC: 160, DX: 160, MP: 40, MA: 40, MD: 40, WT: 40, DA: 40, LK: 40, HP: 160, DP: 160, HV: 160 });
});

t("front numbers match the game at Lv.160, 152 and 146", () => {
  assert.deepStrictEqual(front(P.status(cat(160, 157), ctx)), { AP: 1282, AC: 89, DX: -3, MP: 1250, MA: 59, MD: 146, WT: 4320, DA: 9, LK: 9, HP: 4890, DP: 632, HV: 39 });
  assert.deepStrictEqual(front(P.status(cat(152, 148), ctx)), { AP: 1214, AC: 87, DX: -2, MP: 1190, MA: 59, MD: 138, WT: 4160, DA: 9, LK: 9, HP: 4650, DP: 600, HV: 37 });
  assert.deepStrictEqual(front(P.status(cat(146, 145), ctx)), { AP: 1178, AC: 86, DX: -2, MP: 1160, MA: 59, MD: 134, WT: 4080, DA: 9, LK: 9, HP: 4470, DP: 576, HV: 36 });
});

t("gear adds to the +, with elements and resistances", () => {
  const b = cat(160, 157);
  b.gear = P.cleanBuild({ gear: { weapon: { n: "Staff", st: { AP: 4000, HV: 20 }, e: { Wind: 83 } }, acc1: { n: "Ring", st: { AP: 305 }, r: { Fire: 10 } } } }).gear;
  const st = P.status(b, ctx);
  const ap = st.rows.find(r => r.stat === "AP");
  assert.strictEqual(ap.gear, 4305);
  assert.strictEqual(ap.plus, 4305);
  assert.strictEqual(ap.total, 1282 + 4305);
  assert.deepStrictEqual(st.elements, { Wind: 83 });
  assert.deepStrictEqual(st.resist, { Fire: 10 });
});

t("every buff is a skill of the guide, with client values for each field at levels 1-10 and Master", () => {
  for (const name of Object.keys(buffs.skills)) {
    assert.ok(skillByName.has(name), name + " is not a skill in builds.json");
    const spec = P.buffSpec(buffs, name);
    assert.strictEqual(values.skills[name].table, spec.table, name + ": run scripts/client/build-buffs.js");
    for (const e of spec.effects) {
      assert.ok(P.STATS.includes(e.stat), name + " " + e.stat);
      assert.ok(["add", "sub", "plus", "minus"].includes(e.op), name + " op");
      for (const lv of P.SKILL_LEVELS) assert.notStrictEqual(P.buffValue(values, name, e.field, lv), null, `${name}: no ${e.field} at ${lv}`);
    }
  }
});

t("Primadonna buffs: Dodge Master, Shield All, Evolution … with the Master values", () => {
  const sets = B.skillSets(builds, "Cat", "Primadonna");
  const lists = P.buffLists(builds, buffs, sets);
  const mine = lists.mine.map(e => e.skill.name);
  for (const s of ["Dodge Master", "Shield All", "Sturdy Shield", "Physical Training", "Evolution", "Beast's Instinct"]) assert.ok(mine.includes(s), s);
  assert.ok(lists.party.some(e => e.skill.name === "Pumping Heart"));
  assert.ok(!lists.party.some(e => mine.includes(e.skill.name)), "own buffs aren't listed again");
  const b = cat(160, 157);
  b.gear = { weapon: { n: "x", st: { HV: 120, DP: 1085 } } };
  b.skills = { "Physical Training": "M", "Dodge Master": "M", "Shield All": "M", "Evolution": "M" };
  const st = P.status(b, ctx);
  const d = Object.fromEntries(st.buffs.map(x => [x.name, x.deltas]));
  // client tables (ESAction_Fitness, Soft_Waist, BigShield, WildMutation) at level 11 = Master
  assert.deepStrictEqual(d["Physical Training"], { HP: 23600 });
  assert.deepStrictEqual(d["Dodge Master"], { HV: Math.trunc((39 + 120) * 0.6) });
  assert.deepStrictEqual(d["Shield All"], { DP: Math.trunc((632 + 1085) * 0.18) });
  assert.strictEqual(d.Evolution.AP, Math.trunc(1282 * 2.5));
  assert.strictEqual(d.Evolution.DP, -Math.trunc(632 * 0.3));
  assert.strictEqual(d.Evolution.DX, -4);
  const dp = st.rows.find(r => r.stat === "DP");
  assert.strictEqual(dp.buff, d["Shield All"].DP + d.Evolution.DP);
});

t("a skill level picks its row; a typed-in buff adds as it is", () => {
  const b = cat(160, 157);
  b.skills = { "Physical Training": "1" };
  b.buffs = [{ name: "Food", stat: "AP", value: 100, on: true }, { name: "Off", stat: "AP", value: 999, on: false }];
  const st = P.status(b, ctx);
  assert.strictEqual(st.rows.find(r => r.stat === "HP").buff, 500);
  assert.strictEqual(st.rows.find(r => r.stat === "AP").buff, 100);
});

t("a class without starting stats: no front number, calibrating finds the base again", () => {
  const b = P.cleanBuild({ cls: "Fox", level: 160, growth: { Power: 4, Magic: 1, Sense: 1, Charm: 4 } });
  const st = P.status(b, Object.assign({}, ctx, { base: null }));
  assert.ok(!st.known && st.rows.every(r => r.front === null));
  const per = builds.stats.perAttrLevel;
  assert.strictEqual(P.baseFromFront(1282, per.AP, 317), 18);
  assert.strictEqual(P.baseFromFront(-3, per.DX, 160), 10);
});

t("starting stats: checked class, else the player's own, else Cat's as an estimate", () => {
  const typed = { AP: 20 };
  assert.strictEqual(P.pickBase(bases, "Cat", typed).from, "checked");
  assert.deepStrictEqual(P.pickBase(bases, "Buffalo", typed), { base: typed, from: "mine", checked: "", estimateFrom: "" });
  const est = P.pickBase(bases, "Buffalo", undefined);
  assert.strictEqual(est.from, "estimate");
  assert.strictEqual(est.estimateFrom, "Cat");
  assert.strictEqual(est.base, bases.classes.Cat);
  assert.strictEqual(P.pickBase({ classes: {} }, "Buffalo").base, null);
});

t("bonus points: level − 1 unless typed in", () => {
  assert.deepStrictEqual(P.points(cat(160, 157)), { have: 159, spent: 157, left: 2, typed: false });
  const b = cat(160, 157); b.ptsHave = 165;
  assert.strictEqual(P.points(b).left, 8);
});

t("cleanBuild drops what doesn't belong and keeps limits", () => {
  const b = P.cleanBuild({
    id: "bad id", name: "x".repeat(99), level: 5000, growth: { Power: 9 },
    gear: { weapon: { n: "Sword", st: { AP: "12", ZZ: 4 } }, hat: {}, nope: { n: "x" } },
    skills: { "Dodge Master": "M", "Shield All": "99" }, buffs: [{ stat: "ZZ", value: 1 }], pts: { AP: -5, HV: 3 }
  });
  assert.ok(/^b[a-z0-9]+$/.test(b.id));
  assert.strictEqual(b.name.length, P.LIMITS.name);
  assert.strictEqual(b.level, 999);
  assert.strictEqual(b.growth.Power, 4);
  assert.deepStrictEqual(b.gear, { weapon: { n: "Sword", st: { AP: 12 } } });
  assert.deepStrictEqual(b.skills, { "Dodge Master": "M" });
  assert.deepStrictEqual(b.buffs, []);
  assert.deepStrictEqual(b.pts, { HV: 3 });
  assert.strictEqual(P.cleanBuild("nope"), null);
});

t("mergeBuilds: the newer copy of the same build wins, others are kept", () => {
  const a = [{ id: "b1", name: "Here", updated: 200 }, { id: "b2", name: "Only here", updated: 50 }];
  const c = [{ id: "b1", name: "Cloud", updated: 100 }, { id: "b3", name: "Only cloud", updated: 300 }];
  assert.deepStrictEqual(P.mergeBuilds(a, c).map(b => b.id + ":" + b.name), ["b3:Only cloud", "b1:Here", "b2:Only here"]);
});

t("share code round trip keeps the build, gets a new id", () => {
  const b = cat(160, 157);
  b.id = "babc"; b.name = "Diva AP ✨";
  b.gear = { weapon: { n: "White Swan Staff +7", st: { AP: 500 }, e: { Wind: 30 }, note: "refine +7" } };
  b.skills = { Evolution: "M" };
  const back = P.decodeBuild(P.encodeBuild(b));
  assert.notStrictEqual(back.id, "babc");
  assert.strictEqual(back.name, "Diva AP ✨");
  assert.deepStrictEqual(back.gear, b.gear);
  assert.deepStrictEqual(back.skills, b.skills);
  assert.deepStrictEqual(back.pts, { AP: 157 });
  assert.strictEqual(P.decodeBuild("TCB2.!!!"), null);
  assert.strictEqual(P.decodeBuild("hello"), null);
});

// --- js/formula.js: skill formulas from the wiki ---
const Fm = require("../js/formula.js");
const skill = name => skillByName.get(name);
const total = { AP: 5587, AC: 193, DX: -10, MP: 4082, MA: 145, MD: 1097, WT: 27231, DA: 97, LK: 80, HP: 12380, DP: 1717, HV: 159 };
const power = (name, el, lv) => Fm.evalFormula(skill(name).formula, Fm.formulaVars(total, el || {}, skill(name).levels, lv || "M"));

t("formula: Flaming Fist with and without Fire, Power Blow, Volley Kick, lowercase x", () => {
  const ff = power("Flaming Fist", { Fire: 30 });
  const m = Fm.cellValue(skill("Flaming Fist").levels.rows.slice(-1)[0][4]); // Magnification Ratio at Master
  assert.deepStrictEqual(ff.map(p => p.label), ["WITHOUT any Fire Attr", "WITH Fire Attr"]);
  assert.strictEqual(Math.round(ff[0].value), Math.round(5587 * m));
  assert.strictEqual(Math.round(ff[1].value), Math.round(5587 * (m + 0.3) * 145 / 100));
  assert.strictEqual(Math.round(power("Power Blow")[0].value), Math.round(5587 * 2.4));
  assert.strictEqual(Math.round(power("Volley Kick")[0].value), Math.round((5587 + 159 * 16) * (18.6 / 8)));
  assert.strictEqual(power("Sharp Scream")[0].text, "(AP + HV × 16) × Magnification");
});

t("formula: a word it can't read inside brackets drops the expression instead of guessing", () => {
  assert.deepStrictEqual(power("2 Hit Combo"), []); // needs the Power Blow / Volley Kick levels (PBL, VKL)
  assert.deepStrictEqual(Fm.evalFormula("AP × Unknown Thing", Fm.formulaVars(total, {}, null, "M")), []);
  assert.deepStrictEqual(Fm.evalFormula("alert(1); AP", Fm.formulaVars(total, {}, null, "M")), []);
});

t("formula: level rows, % and thousands in cells", () => {
  assert.strictEqual(Fm.cellValue("240%"), 2.4);
  assert.strictEqual(Fm.cellValue("1,390"), 1390);
  assert.strictEqual(Fm.cellValue("3 seconds"), 3);
  assert.strictEqual(Fm.cellValue("—"), null);
  assert.ok(power("Power Blow", {}, "1")[0].value < power("Power Blow")[0].value);
});

console.log(`\n${n} passed`);

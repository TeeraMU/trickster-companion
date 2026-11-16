// Checks js/build.js (Build guide model) against data/builds.json. usage: node scripts/test-build.js
const assert = require("assert");
const path = require("path");
const B = require("../js/build.js");
const builds = require(path.join(__dirname, "..", "data", "builds.json"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok ", name); };

t("every class has its jobs, every job has skills and a picture", () => {
  assert.strictEqual(Object.keys(builds.classes).length, 8);
  for (const [cls, c] of Object.entries(builds.classes)) for (const j of c.jobs) {
    assert.ok((builds.skills[j.name] || []).length > 0, cls + " / " + j.name + " has no skills");
    assert.ok(/^https:\/\//.test(j.art), j.name + " art");
  }
});

t("Primadonna: skills from Model, Entertainer and Primadonna; Sharp Scream needs 5 Purple Worm Cards", () => {
  const sets = B.skillSets(builds, "Cat", "Primadonna");
  assert.deepStrictEqual(sets.map(s => s.job), ["Model", "Entertainer", "Primadonna"]);
  const ss = sets[2].skills.find(s => s.name === "Sharp Scream");
  assert.strictEqual(ss.tm, 125);
  assert.deepStrictEqual(ss.items, [{ name: "Purple Worm Card", qty: 5 }]);
  const card = builds.items["Purple Worm Card"];
  assert.ok(/Purple_Worm_Card/.test(card.img));
  assert.deepStrictEqual(card.from[0].maps, ["Swamp Dungeon 4 - Marshy Garden"]);
});

t("hybrids take the other class's skills at TM +50; Duke can't learn Evolution", () => {
  const diva = builds.skills.Diva.find(s => s.name === "Card Strike");
  const cm = builds.skills["Card Master"].find(s => s.name === "Card Strike");
  assert.strictEqual(diva.tm, cm.tm + 50);
  assert.ok(!builds.skills.Duke.some(s => s.name === "Evolution"));
  assert.strictEqual(builds.skills.Duke.find(s => s.name === "Volley Kick").tm, 91);
});

t("advice: Primadonna is AP + HV, a magician is pure MA", () => {
  assert.strictEqual(B.advice(builds, "Cat", "Primadonna").label, "AP + HV");
  assert.strictEqual(B.advice(builds, "Dragon", "Magician").label, "Pure MA");
});

t("stat planner: growth pips per level, bonus pips split by percent, 4 pips = 1 stat level", () => {
  const plan = B.statPlan(builds.stats, { level: 11, growth: { Power: 4, Magic: 1, Sense: 1, Charm: 4 }, bonus: { AP: 100 } });
  const ap = plan.find(r => r.stat === "AP"), hv = plan.find(r => r.stat === "HV"), ma = plan.find(r => r.stat === "MA");
  // 10 level ups: AP gets 40 growth pips (10 levels) + 40 bonus pips (10 levels) -> 20 levels x 4 AP
  assert.strictEqual(ap.growthLv, 10);
  assert.strictEqual(ap.bonusLv, 10);
  assert.strictEqual(ap.gain, 80);
  assert.strictEqual(hv.gain, 2.5); // 10 levels x 0.25
  assert.strictEqual(ma.growthLv, 2); // 10 pips -> 2 levels
});

t("growth chart: 1-4 each, 10 in all, so at most two 4s", () => {
  let g = { Power: 4, Magic: 1, Sense: 1, Charm: 4 };
  assert.deepStrictEqual(B.stepGrowth(g, "Magic", 1), g); // already 10
  assert.deepStrictEqual(B.stepGrowth(g, "Power", 1), g); // 4 is the top
  assert.deepStrictEqual(B.stepGrowth(g, "Sense", -1), g); // 1 is the bottom
  g = B.stepGrowth(g, "Power", -1);
  assert.strictEqual(g.Power, 3);
  assert.strictEqual(B.stepGrowth(g, "Magic", 1).Magic, 2); // 9 -> 10
  assert.deepStrictEqual(B.fixGrowth({ Power: 4, Magic: 4, Sense: 4, Charm: 4 }), B.DEFAULT_GROWTH);
  const mine = { Power: 4, Magic: 1, Sense: 1, Charm: 4 };
  assert.strictEqual(B.fixGrowth(mine), mine);
});

t("master items add up across the skills picked", () => {
  const sets = B.skillSets(builds, "Cat", "Primadonna");
  const items = B.masterItems(builds, sets, { "Sharp Scream": true, "2 Hit Combo": true, "Raging Nail": true });
  const pw = items.find(i => i.name === "Purple Worm Card");
  assert.strictEqual(pw.qty, 16);
  assert.deepStrictEqual(pw.skills.sort(), ["2 Hit Combo", "Raging Nail", "Sharp Scream"]);
});

t("prerequisites are read into skills; a skill sits under the one it needs", () => {
  const priest = builds.skills.Priest;
  const dew = priest.find(s => s.name === "Refreshing Dew");
  assert.deepStrictEqual(dew.needs, [{ name: "Sacred Oath", lv: "M" }]);
  assert.deepStrictEqual(builds.skills.Primadonna.find(s => s.name === "2 Hit Combo").needs.map(n => n.name), ["Power Blow", "Volley Kick"]);
  const tree = B.skillTree(priest);
  const oathAt = tree.findIndex(n => n.skill.name === "Sacred Oath");
  const dewAt = tree.findIndex(n => n.skill.name === "Refreshing Dew");
  assert.strictEqual(tree[dewAt].parent, "Sacred Oath");
  assert.ok(dewAt > oathAt && tree[dewAt].depth === tree[oathAt].depth + 1);
  assert.strictEqual(tree.length, priest.length); // nothing lost
  // a loop in the data doesn't hide skills
  const loop = B.skillTree([{ name: "A", needs: [{ name: "B" }] }, { name: "B", needs: [{ name: "A" }] }]);
  assert.strictEqual(loop.length, 2);
});

t("how to get a skill: card pack, quest, Chaos Tower", () => {
  const all = Object.values(builds.skills).flat();
  assert.deepStrictEqual(all.find(s => s.name === "Raging Nail").how, { kind: "cardpack", text: "Card Pack Ken" });
  assert.deepStrictEqual(all.find(s => s.name === "Sacred Oath").how, { kind: "quest", text: "Magician Louie - Power of Faith" });
  assert.strictEqual(all.find(s => s.name === "Beast's Instinct").how.kind, "drop");
});

t("every mastery item a skill names is described in items", () => {
  for (const list of Object.values(builds.skills)) for (const s of list) for (const it of s.items) {
    assert.ok(builds.items[it.name], s.name + ": " + it.name);
  }
});

console.log(`${n} passed`);

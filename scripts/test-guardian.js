// Checks js/guardian.js (🥚 Guardian model) against data/guardian.json. usage: node scripts/test-guardian.js
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const G = require("../js/guardian.js");
const data = require(path.join(__dirname, "..", "data", "guardian.json"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok ", name); };

t("five stages from Card Identification to Mind's Eye, each with what to do", () => {
  assert.deepStrictEqual(data.stages.map(s => s.title.slice(0, 2)), ["1.", "2.", "3.", "4.", "5."]);
  for (const s of data.stages) assert.ok(s.level && s.lines.length, s.title);
  assert.strictEqual(G.stepKey(2), "guard:2");
  assert.deepStrictEqual(G.progress(data, { "guard:0": true, "guard:3": true, "cr-boss-01_0": true }), { done: 2, total: 5 });
});

t("every guardian quest is a real quest, on one stage only, and not a boss quest", () => {
  const ids = new Set();
  const idx = require(path.join(__dirname, "..", "data", "quests", "index.json"));
  for (const f of idx.files) JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "quests", f), "utf8")).quests.forEach(q => ids.add(q.id));
  const seen = new Set();
  const bossQuests = new Set(require(path.join(__dirname, "..", "data", "bosses.json")).bosses.flatMap(b => b.quests));
  for (const s of data.stages) for (const id of s.quests) {
    assert.ok(ids.has(id), "no quest " + id);
    assert.ok(!seen.has(id), id + " twice");
    assert.ok(!bossQuests.has(id), id + " is a boss quest too");
    seen.add(id);
  }
  assert.deepStrictEqual(data.stages[1].quests.sort(), ["bs-25", "mi-10", "mi-11", "rg-06", "rg-17", "rg-50", "rg-51"]);
});

t("hatching: highest line wins, a tie goes to the line that got there first, 0 becomes 1", () => {
  assert.deepStrictEqual(G.hatch([6, 0, 4, 4]), { type: "Power", total: 14, ready: true, hatched: [6, 1, 4, 4] });
  assert.strictEqual(G.hatch([5, 0, 4, 5], "Charm").type, "Charm");
  assert.strictEqual(G.hatch([5, 0, 4, 5]).type, "Power");
  assert.strictEqual(G.hatch([2, 1, 2, 2]).ready, false);
  assert.strictEqual(G.hatch([4, 6, 0, 0]).ready, true); // a line at 6 stops it
});

t("every graph recipe only grows, ends at the graph it names, and is ready to hatch into its type", () => {
  assert.deepStrictEqual(data.recipes.map(r => r.graph), ["6044", "2642", "4064", "4046", "4604"]);
  for (const r of data.recipes) {
    assert.deepStrictEqual(G.checkRecipe(r), [], r.graph);
    assert.strictEqual(G.hatch(r.steps[r.steps.length - 1].after).type, r.type, r.graph + " type");
  }
  assert.ok(G.checkRecipe({ graph: "6044", steps: [{ after: [6, 0, 4, 4] }, { after: [5, 0, 4, 4] }] }).length);
});

t("the guardians, skills of each line and where the numbers come from", () => {
  assert.deepStrictEqual(data.guardians.map(g => g.type), ["Power", "Magic", "Sense", "Charm", "MyShop"]);
  for (const l of G.LINES) assert.ok(data.skills.first[l].length && data.skills.second[l].length && data.actions.some(a => a.line === l), l);
  assert.ok(data.sources.length >= 4 && data.sources.every(s => /^https:\/\//.test(s.url)));
});

console.log(`\n${n} passed`);

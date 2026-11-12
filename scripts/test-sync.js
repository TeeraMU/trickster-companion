// Checks js/sync-merge.js (what is synced, how two copies combine). usage: node scripts/test-sync.js
const assert = require("assert");
const S = require("../js/sync-merge.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("pick keeps progress, drops screen prefs and empty values", () => {
  const p = S.pick({
    completedQuests: { a: true, b: false }, completedCycles: { a: 5, b: 0 }, completedSteps: { a_0: true, a_1: false },
    inventory: { Brass: 3, Glass: 0 }, selectedClass: "Cat", selectedJobPath: "diva",
    currentView: "bag", selectedRegion: "Oops Wharf", expandedQuests: { a: true }
  }, { "npc@map": { x: 1, y: 2 } });
  assert.deepStrictEqual(p, {
    schema: 1, completedQuests: { a: true }, completedCycles: { a: 5 }, completedSteps: { a_0: true },
    inventory: { Brass: 3 }, pins: { "npc@map": { x: 1, y: 2 } }, selectedClass: "Cat", selectedJobPath: "diva"
  });
});

t("merge: ticked on either side stays ticked, higher counts win", () => {
  const here = S.pick({ completedQuests: { a: true }, completedCycles: { r: 2 }, completedSteps: { a_0: true }, inventory: { Brass: 1, Onyx: 4 } }, {});
  const cloud = S.pick({ completedQuests: { b: true }, completedCycles: { r: 4 }, completedSteps: { b_1: true }, inventory: { Brass: 3 } }, {});
  const m = S.merge(here, cloud);
  assert.deepStrictEqual(m.completedQuests, { a: true, b: true });
  assert.deepStrictEqual(m.completedCycles, { r: 4 });
  assert.deepStrictEqual(m.completedSteps, { a_0: true, b_1: true });
  assert.deepStrictEqual(m.inventory, { Brass: 3, Onyx: 4 });
});

t("merge: this device's pins and class win, cloud fills the gaps", () => {
  const here = S.pick({ selectedClass: "All" }, { "x@m": { x: 10, y: 10 } });
  const cloud = S.pick({ selectedClass: "Cat", selectedJobPath: "diva" }, { "x@m": { x: 90, y: 90 }, "y@m": { x: 5, y: 5 } });
  const m = S.merge(here, cloud);
  assert.deepStrictEqual(m.pins, { "x@m": { x: 10, y: 10 }, "y@m": { x: 5, y: 5 } });
  assert.strictEqual(m.selectedClass, "Cat");
  assert.strictEqual(m.selectedJobPath, "diva");
});

t("summary, isEmpty and same", () => {
  const empty = S.pick({}, {});
  assert.ok(S.isEmpty(empty));
  const p = S.pick({ completedQuests: { a: true }, inventory: { Brass: 2 } }, { "n@m": { x: 1, y: 1 } });
  assert.deepStrictEqual(S.summary(p), { quests: 1, steps: 0, items: 1, pins: 1 });
  assert.ok(!S.isEmpty(p));
  const reordered = JSON.parse(JSON.stringify({ pins: p.pins, inventory: p.inventory, completedQuests: p.completedQuests,
    completedCycles: {}, completedSteps: {}, selectedJobPath: "", selectedClass: "All", schema: 1 }));
  assert.ok(S.same(p, reordered));
  assert.ok(!S.same(p, S.merge(p, S.pick({ completedQuests: { z: true } }, {}))));
});

console.log(`${n} passed`);

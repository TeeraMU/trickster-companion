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
    inventory: { Brass: 3 }, pins: { "npc@map": { x: 1, y: 2 } }, selectedClass: "Cat", selectedJobPath: "diva", focus: null, hideBag: false, builds: [],
    chars: [{ id: "main", name: "Character 1" }], charData: {}
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

t("saved builds: synced cleaned, merged by newest, counted, old copies without them match", () => {
  const here = S.pick({ planner: { builds: [{ id: "b1", name: "Here", updated: 200, gear: { hat: { id: "<x>" } } }] } }, {});
  assert.deepStrictEqual(here.builds[0].gear, {});
  const cloud = S.pick({ planner: { builds: [{ id: "b1", name: "Cloud", updated: 100 }, { id: "b2", name: "Other", updated: 50 }] } }, {});
  const m = S.merge(here, cloud);
  assert.deepStrictEqual(m.builds.map(b => b.name), ["Here", "Other"]);
  assert.strictEqual(S.summary(cloud).builds, 2);
  assert.ok(!S.isEmpty(cloud));
  const old = S.pick({}, {}); delete old.builds;
  assert.ok(S.same(old, S.pick({}, {})));
});

t("summary, isEmpty and same", () => {
  const empty = S.pick({}, {});
  assert.ok(S.isEmpty(empty));
  const p = S.pick({ completedQuests: { a: true }, inventory: { Brass: 2 } }, { "n@m": { x: 1, y: 1 } });
  assert.deepStrictEqual(S.summary(p), { quests: 1, steps: 0, items: 1, pins: 1, builds: 0, chars: 1 });
  assert.ok(!S.isEmpty(p));
  const reordered = JSON.parse(JSON.stringify({ pins: p.pins, inventory: p.inventory, completedQuests: p.completedQuests,
    completedCycles: {}, completedSteps: {}, selectedJobPath: "", selectedClass: "All", focus: null, hideBag: false, schema: 1 }));
  assert.ok(S.same(p, reordered));
  assert.ok(!S.same(p, S.merge(p, S.pick({ completedQuests: { z: true } }, {}))));
});

t("focus: kept, this device's wins, cloud fills it in", () => {
  const f = { region: "Oops Wharf", group: "zones", cats: ["Key", "Sticker"], path: "" };
  assert.deepStrictEqual(S.pick({ focus: f }, {}).focus, f);
  assert.deepStrictEqual(S.merge(S.pick({}, {}), S.pick({ focus: f }, {})).focus, f);
  const g = Object.assign({}, f, { region: "Mermaid Palace" });
  assert.deepStrictEqual(S.merge(S.pick({ focus: g }, {}), S.pick({ focus: f }, {})).focus, g);
});

t("hideBag: synced, private on either copy wins", () => {
  assert.strictEqual(S.pick({}, {}).hideBag, false);
  assert.strictEqual(S.pick({ hideBag: true }, {}).hideBag, true);
  assert.strictEqual(S.merge(S.pick({}, {}), S.pick({ hideBag: true }, {})).hideBag, true);
  assert.strictEqual(S.merge(S.pick({}, {}), S.pick({}, {})).hideBag, false);
});

t("characters: each one's progress synced, the first in the old fields, the open one is per device", () => {
  const C = require("../js/chars.js");
  const st = { completedQuests: { a: true }, selectedClass: "Cat" };
  C.ensure(st);
  const alt = C.add(st, "Alt", false);
  C.switchTo(st, alt);
  st.completedQuests = { z: true };
  st.selectedClass = "Fox";
  const p = S.pick(st, {});
  // the first character stays in the top-level fields, as an older copy of the app reads them
  assert.deepStrictEqual(p.completedQuests, { a: true });
  assert.strictEqual(p.selectedClass, "Cat");
  assert.deepStrictEqual(p.chars, [{ id: "main", name: "Character 1" }, { id: alt, name: "Alt" }]);
  assert.deepStrictEqual(p.charData[alt].completedQuests, { z: true });
  assert.strictEqual(p.charData[alt].selectedClass, "Fox");
  assert.ok(!("charId" in p));
  assert.deepStrictEqual(S.summary(p), { quests: 2, steps: 0, items: 0, pins: 0, builds: 0, chars: 2 });
  // another device opens it on its own open character
  const other = { charId: "main" };
  C.setAll(other, S.charsOf(p));
  assert.deepStrictEqual(other.completedQuests, { a: true });
  C.switchTo(other, alt);
  assert.deepStrictEqual(other.completedQuests, { z: true });
  assert.ok(S.same(S.pick(other, {}), p));
});

t("characters: merge by id, extra ones kept; a copy from before characters is Character 1", () => {
  const C = require("../js/chars.js");
  const a = { completedQuests: { a: true } }; C.ensure(a); const x = C.add(a, "X", false);
  const b = { completedQuests: { b: true } }; C.ensure(b); const y = C.add(b, "Y", false);
  C.switchTo(b, y); b.completedQuests = { y1: true };
  const m = S.merge(S.pick(a, {}), S.pick(b, {}));
  assert.deepStrictEqual(m.chars.map(c => c.name), ["Character 1", "X", "Y"]);
  assert.deepStrictEqual(m.completedQuests, { a: true, b: true }); // Character 1 on both: merged
  assert.deepStrictEqual(m.charData[y].completedQuests, { y1: true });
  assert.ok(m.charData[x]);
  // an old copy (no chars) is the same as one default character
  const old = S.pick({ completedQuests: { a: true } }, {});
  delete old.chars; delete old.charData;
  assert.ok(S.same(old, S.pick({ completedQuests: { a: true } }, {})));
  assert.deepStrictEqual(S.charsOf(old).map(c => c.id), ["main"]);
});

console.log(`${n} passed`);

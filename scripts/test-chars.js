// Checks js/chars.js (several game characters, each with its own progress). usage: node scripts/test-chars.js
const assert = require("assert");
const C = require("../js/chars.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("progress from before characters becomes Character 1, nothing lost", () => {
  const st = { completedQuests: { a: true }, completedSteps: { a_0: true }, inventory: { Brass: 2 }, selectedClass: "Cat", currentView: "bag", planner: { builds: [1] } };
  C.ensure(st);
  assert.deepStrictEqual(st.chars, [{ id: "main", name: "Character 1", data: null }]);
  assert.strictEqual(st.charId, "main");
  assert.deepStrictEqual(st.completedQuests, { a: true });
  assert.deepStrictEqual(C.list(st), [{ id: "main", name: "Character 1", open: true, done: 1 }]);
  C.ensure(st); // twice is the same
  assert.strictEqual(st.chars.length, 1);
});

t("switching puts the open one's ticks away and brings the other's in; shared things stay", () => {
  const st = { completedQuests: { a: true }, completedCycles: { r: 2 }, inventory: { Brass: 2 }, selectedClass: "Cat", selectedJobPath: "diva", planner: { builds: ["shared"] }, hideBag: true };
  C.ensure(st);
  const alt = C.add(st, "  My   Fox  ", false);
  assert.strictEqual(st.chars[1].name, "My Fox");
  assert.strictEqual(st.charId, "main"); // adding doesn't open it
  assert.ok(C.switchTo(st, alt));
  assert.deepStrictEqual(st.completedQuests, {});
  assert.deepStrictEqual(st.inventory, {});
  assert.strictEqual(st.selectedClass, "All");
  assert.deepStrictEqual(st.planner.builds, ["shared"]);
  assert.strictEqual(st.hideBag, true);
  st.completedQuests.b = true;
  st.selectedClass = "Fox";
  C.switchTo(st, "main");
  assert.deepStrictEqual(st.completedQuests, { a: true });
  assert.deepStrictEqual(st.completedCycles, { r: 2 });
  assert.strictEqual(st.selectedJobPath, "diva");
  C.switchTo(st, alt);
  assert.deepStrictEqual(st.completedQuests, { b: true });
  assert.strictEqual(st.selectedClass, "Fox");
  assert.strictEqual(C.switchTo(st, alt), false);
  assert.strictEqual(C.switchTo(st, "nope"), false);
  // only the open one's progress is in the top-level fields, the other's waits in data
  assert.strictEqual(st.chars.find(c => c.id === alt).data, null);
  assert.deepStrictEqual(st.chars.find(c => c.id === "main").data.completedQuests, { a: true });
});

t("a new character can start as a copy of the open one", () => {
  const st = { completedQuests: { a: true }, completedSteps: { a_0: true } };
  C.ensure(st);
  const twin = C.add(st, "Twin", true);
  C.switchTo(st, twin);
  assert.deepStrictEqual(st.completedQuests, { a: true });
  st.completedQuests.c = true;
  C.switchTo(st, "main");
  assert.deepStrictEqual(st.completedQuests, { a: true }); // a copy, not the same object
});

t("rename, delete (the open one: another opens first; never the last), at most 8", () => {
  const st = { completedQuests: { a: true } };
  C.ensure(st);
  const b = C.add(st, "B", false);
  assert.ok(C.rename(st, b, "Bee<script>"));
  assert.strictEqual(st.chars[1].name, "Beescript");
  assert.ok(C.rename(st, "main", ""));
  assert.strictEqual(st.chars[0].name, "Character 1"); // empty keeps the old name
  C.switchTo(st, b);
  st.completedQuests = { bee: true };
  assert.ok(C.remove(st, b));
  assert.strictEqual(st.charId, "main");
  assert.deepStrictEqual(st.completedQuests, { a: true });
  assert.strictEqual(C.remove(st, "main"), false);
  for (let i = 0; i < 10; i++) C.add(st, "X" + i, false);
  assert.strictEqual(st.chars.length, C.MAX);
  assert.strictEqual(C.add(st, "too many", false), null);
});

t("a broken saved list is cleaned; setAll keeps the open one if it's still there", () => {
  const st = { chars: [{ id: "main", name: "A" }, { id: "main", name: "dup" }, { id: "BAD id", name: "x" }, null, { id: "c2", name: "", data: { completedQuests: { q: true }, junk: 1 } }], charId: "gone" };
  C.ensure(st);
  assert.deepStrictEqual(st.chars.map(c => c.id), ["main", "c2"]);
  assert.strictEqual(st.chars[1].name, "Character 2");
  assert.strictEqual(st.charId, "main");
  assert.ok(!("junk" in st.chars[1].data));
  C.switchTo(st, "c2");
  C.setAll(st, [{ id: "main", name: "A", progress: { completedQuests: { m: true } } }, { id: "c2", name: "B", progress: { completedQuests: { n: true } } }]);
  assert.strictEqual(st.charId, "c2");
  assert.deepStrictEqual(st.completedQuests, { n: true });
  C.setAll(st, [{ id: "main", name: "A", progress: { completedQuests: { m: true } } }]); // c2 deleted on another device
  assert.strictEqual(st.charId, "main");
  assert.deepStrictEqual(st.completedQuests, { m: true });
});

console.log(`${n} passed`);

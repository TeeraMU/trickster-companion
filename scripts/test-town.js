// Checks js/town.js (Monsters view) against the real quest data. usage: node scripts/test-town.js
const assert = require("assert");
const fs = require("fs"), path = require("path");
require("../js/data.js");
const E = require("../js/episode.js") || globalThis.TQEpisode;
const T = require("../js/town.js");
const D = p => path.join(__dirname, "..", "data", p);
const files = JSON.parse(fs.readFileSync(D("quests/index.json"), "utf8")).files
  .map(f => JSON.parse(fs.readFileSync(D("quests/" + f), "utf8")));
const quests = globalThis.TQData.buildQuestList(files, JSON.parse(fs.readFileSync(D("item-sources.json"), "utf8")));
const ep = globalThis.TQEpisode || E;
const prereqs = {};
files.forEach(f => f.quests.forEach(q => { prereqs[q.id] = q.prereqs || []; }));
const fresh = { completedQuests: {}, completedCycles: {} };

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const ow = quests.filter(q => q.area === "Oops Wharf");
const farm = ep.farmList(ow, fresh, ep.questStatuses(quests, fresh, prereqs));
const list = T.monsterList(farm);

t("every drop and hunt row lands under exactly one monster", () => {
  const rows = farm.maps.flatMap(g => g.rows).filter(r => r.kind === "drop" || r.kind === "hunt").length;
  const placed = list.reduce((s, m) => s + m.drops.length + m.hunts.length, 0);
  assert.strictEqual(placed, rows);
});

t("a monster carries its level, maps and drops", () => {
  const mf = list.find(m => m.monster === "Master Foe");
  assert.ok(mf, "Master Foe listed");
  assert.strictEqual(mf.level, "84");
  assert.ok(mf.drops.some(r => r.item === "Golden Eyepatch"));
  assert.ok(mf.maps.some(x => /Wharf Field 4/.test(x)));
});

t("open monsters first, then low level first", () => {
  const lv = m => parseInt(m.level, 10) || 0;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (a.locked !== b.locked) { assert.ok(!a.locked && b.locked); continue; }
    if (a.done !== b.done) continue;
    assert.ok(lv(a) <= lv(b), `${a.monster} (${a.level}) before ${b.monster} (${b.level})`);
  }
});

t("items in the bag mark a monster done", () => {
  const mf = list.find(m => m.monster === "Master Foe");
  const have = {};
  mf.drops.forEach(r => { have[r.item] = r.qty; });
  const bag = require("../js/bag.js") || globalThis.TQBag;
  const B = globalThis.TQBag || bag;
  const after = T.monsterList(B.applyHave(farm, have)).find(m => m.monster === "Master Foe");
  assert.ok(after.done);
});


// --- data/item-sources.json + items other quests hand out (Items to collect) -------------------
t("item-sources.json replaces the wiki's source (Harkon: Blacksmith Marx, not drilled)", () => {
  const h = quests.find(q => q.id === "job3-06-champion").items.find(i => i.name === "Harkon");
  assert.strictEqual(h.method, "Quest");
  assert.deepStrictEqual(h.givers, ["sh-06", "tp-07", "tp-09"]);
});

const champ = quests.filter(q => q.id === "job3-06-champion");
const collect = state => {
  const p = ep.withEarlierQuests(champ, quests, prereqs, state);
  const f = ep.farmList(p.quests, state, ep.questStatuses(quests, state, prereqs), p.earlier, p);
  return { p, rows: f.maps.flatMap(g => g.rows) };
};

t("a missing Harkon brings in one run of the Snow Hill mine quest", () => {
  const { p, rows } = collect({ completedQuests: {}, completedCycles: {}, inventory: {} });
  assert.strictEqual(p.runs.get("sh-06"), 1);
  const ore = rows.find(r => r.item === "Pure Tantalum");
  assert.strictEqual(ore.qty, 3);
  assert.strictEqual(ore.quests[0].forItem, "Harkon");
});

t("Harkon in the bag: nothing extra; Snow Hill done: the next mine quest", () => {
  assert.ok(!collect({ completedQuests: {}, completedCycles: {}, inventory: { Harkon: 1 } }).p.earlier.has("sh-06"));
  const next = collect({ completedQuests: { "sh-06": true }, completedCycles: {}, inventory: {} }).p;
  assert.strictEqual(next.runs.get("tp-07"), 1);
});

console.log(`${n} passed`);

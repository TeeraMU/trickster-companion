// Checks js/town.js (Monsters view) against the real quest data. usage: node scripts/test-town.js
const assert = require("assert");
const fs = require("fs"), path = require("path");
require("../js/data.js");
const E = require("../js/episode.js") || globalThis.TQEpisode;
const T = require("../js/town.js");
const D = p => path.join(__dirname, "..", "data", p);
const files = JSON.parse(fs.readFileSync(D("quests/index.json"), "utf8")).files
  .map(f => JSON.parse(fs.readFileSync(D("quests/" + f), "utf8")));
const quests = globalThis.TQData.buildQuestList(files);
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

console.log(`${n} passed`);

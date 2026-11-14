// Checks js/search.js against the real quest data. usage: node scripts/test-search.js
const assert = require("assert");
const fs = require("fs"), path = require("path");
require("../js/data.js");
const S = require("../js/search.js");
const D = p => path.join(__dirname, "..", "data", p);
const files = JSON.parse(fs.readFileSync(D("quests/index.json"), "utf8")).files
  .map(f => JSON.parse(fs.readFileSync(D("quests/" + f), "utf8")));
const quests = globalThis.TQData.buildQuestList(files);
const index = S.buildIndex(quests);

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("reward lines become item names", () => {
  assert.deepStrictEqual(S.rewardNames("Cycle 5: 2x Oops Shell + 1x Officer Tera Card"), ["Oops Shell", "Officer Tera Card"]);
  assert.deepStrictEqual(S.rewardNames("3x 10,000 Galder Coupon"), ["10,000 Galder Coupon"]);
});

t("an item: where to get it and which quests use it", () => {
  const r = S.search(index, "golden eyepatch");
  const it = r.item[0];
  assert.strictEqual(it.name, "Golden Eyepatch");
  assert.ok(it.sources.some(s => /Master Foe/.test(s.text)));
  assert.ok(it.usedBy.some(u => /Oops Wharf Magic - 4/.test(u.title)));
});

t("sticker items list the quests that give them", () => {
  const it = S.search(index, "Oops Sticker").item[0];
  assert.strictEqual(it.name, "Oops Sticker");
  assert.ok(it.rewardFrom.length >= 10, "Oops Sticker reward quests: " + it.rewardFrom.length);
});

t("a monster: level, maps, drops and hunts", () => {
  const m = S.search(index, "master foe").monster[0];
  assert.strictEqual(m.name, "Master Foe");
  assert.strictEqual(m.level, 84);
  assert.ok(m.drops.includes("Golden Eyepatch"));
  assert.ok(m.maps.some(x => /Wharf Field 4/.test(x)));
});

t("an NPC lists their quests; quests match by NPC too", () => {
  const r = S.search(index, "skipper min");
  assert.ok(r.npc[0] && r.npc[0].quests.length >= 3);
  assert.ok(r.quest.some(q => /Urgent Issue/.test(q.title)));
});

t("best match first, short queries ignored", () => {
  assert.strictEqual(S.search(index, "Crow").monster[0].name, "Crow");
  const r = S.search(index, "a");
  assert.strictEqual(r.item.length + r.quest.length + r.monster.length + r.npc.length, 0);
});

console.log(`${n} passed`);

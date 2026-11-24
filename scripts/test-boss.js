// Checks js/boss.js (👑 Bosses model) against data/bosses.json. usage: node scripts/test-boss.js
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const B = require("../js/boss.js");
const data = require(path.join(__dirname, "..", "data", "bosses.json"));
const monsters = require(path.join(__dirname, "..", "data", "monsters.json")).monsters;

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok ", name); };
const boss = name => data.bosses.find(b => b.name === name);

t("nine area bosses in the order you meet them, each with a picture, seal, area and walkthrough", () => {
  assert.deepStrictEqual(data.bosses.map(b => b.name), ["Tutankhamen", "Tombeth", "Captain Skull", "Pirate King Karan",
    "Count Blood", "Tenter Lion", "Queen Odinea", "Soki", "Spicy Dragon"]);
  for (const b of data.bosses) {
    assert.ok(/^https:\/\//.test(b.img) && /Seal/.test(b.seal), b.name + " pictures");
    assert.ok(b.area && b.location && b.level > 0, b.name + " area / level");
    assert.ok(B.sections(b.walk).length >= 4, b.name + " trials");
    assert.ok(b.drops.length > 0, b.name + " drops");
  }
});

t("Tombeth: Caballa Relics, Lv.1–150, back in 20 min, 7 trials after the entry, client numbers with 4 HP bars", () => {
  const b = boss("Tombeth");
  assert.strictEqual(b.area, "Caballa Relics");
  assert.strictEqual(B.levelText(b), "Lv.1–150");
  assert.strictEqual(B.respawn(b), "20 min");
  const parts = B.sections(b.walk);
  assert.strictEqual(parts[0].title, "Before the trials");
  assert.ok(/500 Galder Coupon/.test(parts[0].lines[0].t));
  assert.strictEqual(parts.length, 8);
  assert.ok(/^Trial 1: The Sleeping Soul/.test(parts[1].title));
  assert.deepStrictEqual(b.summons.map(s => s.lv), [78, 84, 173, 178]);
  const mon = monsters.find(m => m.id === b.monster);
  assert.strictEqual(mon.n, "Tombeth");
  assert.strictEqual(mon.bars, 4);
  assert.deepStrictEqual(b.quests, ["cr-boss-01"]);
});

t("entry levels: a range, a floor, or none", () => {
  assert.strictEqual(B.levelText(boss("Tenter Lion")), "Lv.150+");
  assert.strictEqual(B.levelText(boss("Queen Odinea")), "Any level");
  assert.strictEqual(B.canEnter(boss("Tombeth"), 151), false);
  assert.strictEqual(B.canEnter(boss("Tombeth"), 90), true);
  assert.strictEqual(B.canEnter(boss("Soki"), 400), true);
  assert.strictEqual(B.canEnter(boss("Queen Odinea"), 100), null);
  assert.strictEqual(B.canEnter(boss("Tombeth"), 0), null);
});

t("Spicy Dragon matches the client's Lv.730 boss with HP bars, not the Lv.880 copy", () => {
  const mon = monsters.find(m => m.id === boss("Spicy Dragon").monster);
  assert.strictEqual(mon.l, 730);
  assert.strictEqual(mon.bars, 5);
});

t("progress counts ticked parts and the beaten mark from the synced steps", () => {
  const b = boss("Tombeth");
  const steps = { [B.stepKey("Tombeth", 0)]: true, [B.stepKey("Tombeth", 3)]: true, [B.beatenKey("Tombeth")]: true, "cr-boss-01_0": true };
  assert.deepStrictEqual(B.progress(b, steps), { done: 2, total: 8, beaten: true });
  assert.deepStrictEqual(B.progress(b, {}), { done: 0, total: 8, beaten: false });
  assert.strictEqual(B.stepKey("Tombeth", 2), "boss:Tombeth_2");
});

t("every boss quest is a real quest", () => {
  const ids = new Set();
  const idx = require(path.join(__dirname, "..", "data", "quests", "index.json"));
  for (const f of idx.files || idx) {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "quests", f.file || f), "utf8"));
    d.quests.forEach(q => ids.add(q.id));
  }
  for (const b of data.bosses) for (const id of b.quests) assert.ok(ids.has(id), b.name + ": no quest " + id);
});

console.log(`\n${n} passed`);

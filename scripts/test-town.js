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

t("a missing Harkon brings in all 5 runs of the Snow Hill mine quest (only run 5 hands it out)", () => {
  const { p, rows } = collect({ completedQuests: {}, completedCycles: {}, inventory: {} });
  assert.strictEqual(p.runs.get("sh-06"), 5);
  const ore = rows.find(r => r.item === "Pure Tantalum");
  assert.strictEqual(ore.qty, 15);
  assert.strictEqual(ore.quests[0].forItem, "Harkon");
});

t("Harkon in the bag: nothing extra; Snow Hill done: the next mine quest", () => {
  assert.ok(!collect({ completedQuests: {}, completedCycles: {}, inventory: { Harkon: 1 } }).p.earlier.has("sh-06"));
  const next = collect({ completedQuests: { "sh-06": true }, completedCycles: {}, inventory: {} }).p;
  assert.strictEqual(next.runs.get("tp-07"), 5);
});

t("a row that can be farmed in several maps goes where the other rows are (fewest stops)", () => {
  const row = (item, monster) => ({ kind: "drop", item, monster, level: "1", qty: 3, quests: [{ id: item }], locked: false });
  const groups = new Map([
    ["Vamp Dungeon 3 - Song of Moonlight", { map: "Vamp Dungeon 3 - Song of Moonlight", minOrder: 5, rows: new Map([["drop|Brass Knight|Brass", row("Brass", "Brass Knight")]]) }],
    ["Vamp Dungeon 2 - Banquet of the Dead / 3 - Song of Moonlight", { map: "Vamp Dungeon 2 - Banquet of the Dead / 3 - Song of Moonlight", minOrder: 1, rows: new Map([["drop|Iron Knight|Magnetite", row("Magnetite", "Iron Knight")]]) }],
    ["Vamp Dungeon 4", { map: "Vamp Dungeon 4", minOrder: 2, rows: new Map([["drop|Bone Warrior|Glass Piece", row("Glass Piece", "Bone Warrior")]]) }],
    ["Vamp Dungeon 4 - Center of the Dark / 5 - Resurrection of the Dark", { map: "Vamp Dungeon 4 - Center of the Dark / 5 - Resurrection of the Dark", minOrder: 3, rows: new Map([["drop|Bone Warrior|Glass Piece", row("Glass Piece", "Bone Warrior")]]) }]
  ]);
  const out = ep.shareMaps(groups);
  assert.deepStrictEqual([...out.keys()].sort(), ["Vamp Dungeon 3 - Song of Moonlight", "Vamp Dungeon 4 - Center of the Dark"]);
  const vd3 = out.get("Vamp Dungeon 3 - Song of Moonlight");
  assert.deepStrictEqual([...vd3.rows.values()].map(r => r.item).sort(), ["Brass", "Magnetite"]);
  assert.deepStrictEqual(vd3.rows.get("drop|Iron Knight|Magnetite").alsoAt, ["Vamp Dungeon 2 - Banquet of the Dead"]);
  assert.strictEqual(vd3.minOrder, 1);
  const glass = out.get("Vamp Dungeon 4 - Center of the Dark").rows.get("drop|Bone Warrior|Glass Piece");
  assert.strictEqual(glass.qty, 6); // both quests' rows merged
  assert.deepStrictEqual(glass.alsoAt, ["Vamp Dungeon 5 - Resurrection of the Dark"]);
});

t("real data: Items to collect sections are single maps, every row kept", () => {
  const statuses = ep.questStatuses(quests, { completedQuests: {}, completedCycles: {} }, prereqs);
  const farm = ep.farmList(quests, { completedQuests: {}, completedCycles: {} }, statuses);
  for (const g of farm.maps) assert.ok(!/ \/ /.test(g.map), "section still names several maps: " + g.map);
  const qtyOf = f => f.maps.reduce((n, g) => n + g.rows.reduce((m, r) => m + r.qty, 0), 0);
  // same total as counting every quest's own items and hunts
  let total = 0;
  for (const q of quests) {
    const c = ep.remainingCycles(q, { completedQuests: {}, completedCycles: {} });
    if (!c) continue;
    for (const it of q.items || []) if (["Drop", "Drill"].includes(it.method)) total += it.totalQty === it.qty * q.cycles ? it.qty * c : it.totalQty;
    for (const h of q.hunts || []) total += h.count * c;
  }
  assert.strictEqual(qtyOf(farm), total);
});

console.log(`${n} passed`);

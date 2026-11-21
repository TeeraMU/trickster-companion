// Checks js/planner.js (Build planner model) against data/equipment.json. usage: node scripts/test-planner.js
const assert = require("assert");
const path = require("path");
const P = require("../js/planner.js");
const cat = require(path.join(__dirname, "..", "data", "equipment.json"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok ", name); };
const byId = P.indexCatalog(cat);

t("the catalog has every slot kind, ids are unique, stats are known", () => {
  const kinds = new Set(cat.items.map(i => i.s));
  for (const k of P.SLOT_KINDS) assert.ok(kinds.has(k), "no " + k);
  assert.strictEqual(byId.size, cat.items.length);
  for (const it of cat.items) for (const k of Object.keys(it.st || {})) assert.ok(P.STATS.includes(k), it.n + " " + k);
});

t("Flame Ring (19136) has Fire 30, as in Item_Attribute", () => {
  const it = byId.get("19136");
  assert.strictEqual(it.n, "Flame Ring");
  assert.deepStrictEqual(it.e, { Fire: 30 });
});

t("totals: gear + typed bonuses + ticked buffs, elements and resistances", () => {
  const b = P.cleanBuild({
    level: 150,
    gear: { acc1: { id: "19136", add: { AP: 50 } }, acc2: { id: "19136" }, weapon: { id: "c:abc" } },
    custom: [{ id: "c:abc", n: "My Sword", s: "weapon", l: 150, st: { AP: 1000 } }],
    buffs: [{ name: "Fury", stat: "AP", value: 200, on: true }, { name: "Off", stat: "AP", value: 999, on: false }, { name: "Fire up", stat: "Fire", value: 10, on: true }]
  });
  const r = P.totals(b, byId);
  assert.strictEqual(r.gear.AP, 192 * 2 + 1000);
  assert.strictEqual(r.adds.AP, 50);
  assert.strictEqual(r.buffs.AP, 200);
  assert.strictEqual(r.plus.AP, 192 * 2 + 1000 + 50 + 200);
  assert.strictEqual(r.elements.Fire, 30 + 30 + 10);
  assert.strictEqual(r.pieces.length, 3);
});

t("an item id the catalog no longer has is flagged, not counted", () => {
  const b = P.cleanBuild({ gear: { hat: { id: "999999999" } } });
  const r = P.totals(b, byId);
  assert.deepStrictEqual(r.pieces, [{ key: "hat", item: null, missing: true }]);
  assert.deepStrictEqual(r.plus, {});
});

t("diff: what changes when one item replaces another", () => {
  assert.deepStrictEqual(P.diff({ st: { AP: 10, MD: 5 } }, { st: { AP: 30, HP: 100 } }), { AP: 20, MD: -5, HP: 100 });
  assert.deepStrictEqual(P.diff(null, { st: { AP: 3 } }), { AP: 3 });
});

t("search: slot, words in any order, level cap, custom first", () => {
  const b = P.cleanBuild({ custom: [{ id: "c:x1", n: "Flame Test Ring", s: "accessory", l: 1 }] });
  const r = P.search(cat, b, { slot: "accessory", query: "ring flame", maxLevel: 80 });
  assert.strictEqual(r.list[0].id, "c:x1");
  assert.ok(r.list.some(i => i.id === "19136"));
  assert.ok(r.list.every(i => i.s === "accessory" && i.l <= 80 && /flame/i.test(i.n)));
  assert.ok(!r.list.some(i => i.id === "19246"), "Lv.90 ring is over the cap");
});

t("cleanBuild drops what doesn't belong and keeps limits", () => {
  const b = P.cleanBuild({
    id: "bad id", name: "x".repeat(99), level: 5000, growth: { Power: 9 },
    gear: { weapon: { id: "c:gone" }, hat: { id: "<script>" }, shield: { id: "78977", add: { AP: "12", ZZ: 4 } }, nope: { id: "1" } },
    buffs: [{ stat: "ZZ", value: 1 }], bonus: { AP: 300, MD: 20 }
  });
  assert.ok(/^b[a-z0-9]+$/.test(b.id));
  assert.strictEqual(b.name.length, P.LIMITS.name);
  assert.strictEqual(b.level, 999);
  assert.strictEqual(b.growth.Power, 4);
  assert.deepStrictEqual(b.gear, { shield: { id: "78977", add: { AP: 12 } } });
  assert.deepStrictEqual(b.buffs, []);
  assert.deepStrictEqual(b.bonus, { AP: 100, MD: 20 });
  assert.strictEqual(P.cleanBuild("nope"), null);
});

t("mergeBuilds: the newer copy of the same build wins, others are kept", () => {
  const a = [{ id: "b1", name: "Here", updated: 200 }, { id: "b2", name: "Only here", updated: 50 }];
  const c = [{ id: "b1", name: "Cloud", updated: 100 }, { id: "b3", name: "Only cloud", updated: 300 }];
  const m = P.mergeBuilds(a, c);
  assert.deepStrictEqual(m.map(b => b.id + ":" + b.name), ["b3:Only cloud", "b1:Here", "b2:Only here"]);
});

t("share code round trip keeps gear and custom items, gets a new id", () => {
  const b = P.cleanBuild({ id: "babc", name: "Diva AP ✨", cls: "Cat", job: "Primadonna", level: 250,
    gear: { weapon: { id: "c:s1", add: { AP: 9 } }, acc1: { id: "19136" } },
    custom: [{ id: "c:s1", n: "Swan Staff (live)", s: "weapon", l: 90, st: { AP: 500 } }] });
  const code = P.encodeBuild(b);
  assert.ok(code.startsWith("TCB1."));
  const back = P.decodeBuild(code);
  assert.notStrictEqual(back.id, "babc");
  assert.strictEqual(back.name, "Diva AP ✨");
  assert.deepStrictEqual(back.gear, b.gear);
  assert.deepStrictEqual(back.custom, b.custom);
  assert.strictEqual(P.decodeBuild("TCB1.!!!"), null);
  assert.strictEqual(P.decodeBuild("hello"), null);
});

console.log(`\n${n} passed`);

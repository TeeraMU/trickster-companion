// data/equipment.json for the Build planner's Equipment tab, from the PlayTrickster client tables
// extracted earlier (ItemParam2 / CM2 / Ex / Ex2 + Item_Attribute). Values are the old client's base
// values: the live server may differ, and Refine / Compound / random bonuses are not in them.
//
//   node scripts/client/build-equipment.js [extraction folder]
//
// The folder defaults to G:/Claude/playtrickster-extraction (item-catalog/equipment-class-2.json and
// json/items_equipment/Item_Attribute.json). Only items that add a stat or an element are kept.
"use strict";
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || "G:/Claude/playtrickster-extraction";
const rows = JSON.parse(fs.readFileSync(path.join(root, "item-catalog/equipment-class-2.json"), "utf8"));
const attrRows = JSON.parse(fs.readFileSync(path.join(root, "json/items_equipment/Item_Attribute.json"), "utf8")).rows;
const attrs = new Map(attrRows.map(r => [r.ID, r]));

// client item Type -> planner slot (checked against item names; fashion is types 5 and 19-27)
const SLOT = {
  2: "weapon", 3: "hat", 4: "inner", 5: "fashion", 7: "accessory", 8: "shield", 13: "pet",
  17: "ear", 18: "tail", 19: "fashion", 20: "fashion", 21: "fashion", 22: "fashion", 23: "fashion",
  24: "fashion", 25: "fashion", 26: "fashion", 27: "fashion", 34: "cape"
};
const STAT_FIELD = {
  AP: "APPlus", AC: "ACPlus", DX: "DXPlus", MP: "MaxMPPlus", MA: "MAPlus", MD: "MDPlus",
  WT: "MaxWTPlus", DA: "DAPlus", LK: "LKPlus", HP: "MaxHPPlus", DP: "DPPlus", HV: "HVPlus"
};
const ELEMENTS = ["Fire", "Water", "Wind", "Earth", "Elec", "Light", "Dark"];
// prefer the base table when the same item is in several
const TABLE_RANK = { ItemParam2: 0, ItemParamEx: 1, ItemParamEx2: 2, ItemParamCM2: 3 };

const pick = (src, keys, field) => {
  const out = {};
  for (const k of keys) { const v = Number(src && src[field(k)]) || 0; if (v) out[k] = v; }
  return out;
};

const seen = new Map();
for (const x of rows.slice().sort((a, b) => (TABLE_RANK[a.sourceTable] ?? 9) - (TABLE_RANK[b.sourceTable] ?? 9))) {
  const slot = SLOT[x.Type];
  const name = String(x.Name || "").trim();
  if (!slot || !name || /^\[|^testing\b/i.test(name)) continue;
  const it = { id: x.ID, n: name, s: slot, l: Number(x.MinLevel) || 0 };
  const st = pick(x, Object.keys(STAT_FIELD), k => STAT_FIELD[k]);
  const a = attrs.get(x.ID);
  const e = pick(a, ELEMENTS, k => k);       // attack element
  const r = pick(a, ELEMENTS, k => k + "R");  // resistance
  if (!Object.keys(st).length && !Object.keys(e).length && !Object.keys(r).length) continue;
  if (Object.keys(st).length) it.st = st;
  if (Object.keys(e).length) it.e = e;
  if (Object.keys(r).length) it.r = r;
  const c = Number(x.CompoundSlot) || 0;
  if (c) it.c = c;
  if (Number(x.Ncash)) it.cash = 1;
  // the same item copied into several tables: keep one
  const key = JSON.stringify([name, slot, it.l, it.st, it.e, it.r]);
  if (!seen.has(key)) seen.set(key, it);
}

const items = [...seen.values()].sort((a, b) => a.s.localeCompare(b.s) || a.l - b.l || a.n.localeCompare(b.n));
const out = {
  source: "PlayTrickster client tables (old client, base values; the live server may differ)",
  made: new Date().toISOString().slice(0, 10),
  items
};
const file = path.join(__dirname, "../../data/equipment.json");
fs.writeFileSync(file, JSON.stringify(out));
const bySlot = {};
for (const it of items) bySlot[it.s] = (bySlot[it.s] || 0) + 1;
console.log(`Wrote ${items.length} items (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`, bySlot);

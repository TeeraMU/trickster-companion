// data/buff-values.json for the Build planner's buffs: each buff skill's values per level, read from
// its ESAction table in the PlayTrickster client tables extracted earlier. data/buffs.json says which
// table and field each buff uses.
//
//   node scripts/client/build-buffs.js [extraction folder]   (default G:/Claude/playtrickster-extraction)
"use strict";
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || "G:/Claude/playtrickster-extraction";
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8"));
const where = new Map(catalog.tables.map(t => [t.table.toLowerCase(), t.path]));
const buffs = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/buffs.json"), "utf8"));

const out = { source: "PlayTrickster client tables (ESAction_*); level 11 is Master", made: new Date().toISOString().slice(0, 10), skills: {} };
for (const [name, spec] of Object.entries(buffs.skills)) {
  const file = where.get(String(spec.table).toLowerCase());
  if (!file) throw new Error(`${name}: no table ${spec.table}`);
  const rows = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).rows;
  const fields = [...new Set(spec.effects.map(e => e.field))];
  const levels = {};
  for (const r of rows) {
    const lv = Number(r.Level);
    if (!(lv >= 1 && lv <= 11)) continue;
    const v = {};
    for (const f of fields) {
      const n = Number(r[f]);
      if (!Number.isFinite(n)) throw new Error(`${name}: ${f} at level ${lv} is "${r[f]}"`);
      v[f] = n;
    }
    levels[lv === 11 ? "M" : String(lv)] = v;
  }
  out.skills[name] = { table: spec.table, levels };
}
const file = path.join(__dirname, "../../data/buff-values.json");
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${Object.keys(out.skills).length} buffs to data/buff-values.json`);

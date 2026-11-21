// data/monsters.json for the Planner's "Against a monster": every named monster in the PlayTrickster
// client's MonsterParamEx2 table (level, stats, element, resistances, boss flag) and how many HP bars a
// boss has (BossMonsterparamEx LifeCnt + 1). Values are the old
// client's; the live server may differ (Tombeth's DP is 1,078 here and 809 on the wiki).
//
//   node scripts/client/build-monsters.js [extraction folder]   (default G:/Claude/playtrickster-extraction)
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.argv[2] || "G:/Claude/playtrickster-extraction";
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8"));
const where = new Map(catalog.tables.map(t => [t.table.toLowerCase(), t.path]));
const rows = JSON.parse(fs.readFileSync(path.join(root, where.get("monsterparamex2")), "utf8")).rows;
// bosses come back after their HP runs out: LifeCnt more times (Tombeth 3 -> the wiki's "6,845x4",
// Count Blood 4 -> "x5"), so the HP to beat is MaxHp x (LifeCnt + 1)
const lives = new Map(JSON.parse(fs.readFileSync(path.join(root, where.get("bossmonsterparamex")), "utf8")).rows
  .map(r => [r.ID, (Number(r.LifeCnt) || 0) + 1]));

// PropertyType -> the monster's own element (Tombeth: 4 = Earth 48%, as on the wiki)
const ELEMENT = { 1: "Fire", 2: "Water", 3: "Wind", 4: "Earth", 5: "Elec", 6: "Light", 7: "Dark" };
const RES = { Fire: "FireR", Water: "WaterR", Wind: "WindR", Earth: "EarthR", Elec: "ElecR", Light: "LightR", Dark: "DarkR", None: "NoPropR", Physical: "PhysicalR", Gun: "GunR" };
const n = v => Number(v) || 0;

const seen = new Set(), out = [];
for (const r of rows) {
  const name = String(r.Name || "").trim();
  if (!name || /^\[|test/i.test(name) || !n(r.MaxHpLv)) continue;
  const m = {
    id: r.ID, n: name, l: n(r.Level), hp: n(r.MaxHpLv), ap: n(r.ApLv), ac: n(r.AcLv), dx: n(r.DxLv), ma: n(r.MaLv),
    md: n(r.MdLv), dp: n(r.DpLv), hv: n(r.HvLv), da: n(r.DaLv), lk: n(r.LkLv), exp: n(r.EXP), tm: n(r.TM)
  };
  if (r.IsBoss === "1") m.boss = 1;
  if ((lives.get(r.ID) || 1) > 1) m.bars = lives.get(r.ID); // HP bars: hp x bars in all
  // the wiki's picture paths for this name (MediaWiki keeps File:X under md5(X)[0]/md5(X)[0..1]/X):
  // the big .png first, then the sprite .gif; the page tries them in turn and hides a missing one
  m.img = ["png", "gif"].map(ext => {
    const file = (name.charAt(0).toUpperCase() + name.slice(1)).replace(/ /g, "_") + "." + ext;
    const h = crypto.createHash("md5").update(file).digest("hex");
    return `${h[0]}/${h.slice(0, 2)}/${file}`;
  });
  const el = ELEMENT[n(r.PropertyType)];
  if (el && n(r.PropertyRatio)) m.el = { [el]: n(r.PropertyRatio) };
  const res = {};
  for (const [k, f] of Object.entries(RES)) if (n(r[f])) res[k] = n(r[f]);
  if (Object.keys(res).length) m.res = res;
  // the same monster copied with other ids: keep one
  const key = JSON.stringify(Object.assign({}, m, { id: 0, img: 0 }));
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(m);
}
out.sort((a, b) => a.n.localeCompare(b.n) || a.l - b.l);
const file = path.join(__dirname, "../../data/monsters.json");
fs.writeFileSync(file, JSON.stringify({
  source: "PlayTrickster client table MonsterParamEx2 (old client; the live server may differ)",
  made: new Date().toISOString().slice(0, 10), monsters: out
}));
console.log(`Wrote ${out.length} monsters (${(fs.statSync(file).size / 1024).toFixed(0)} KB), ${out.filter(m => m.boss).length} marked boss`);

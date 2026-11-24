// The "hybrids" part of data/skill-fixes.json: which skills of the other line each hybrid 3rd job
// (Duelist, Mercenary, Witch, Wizard, Hunter Lord, Cyber Hunter, Diva, Duke) can learn, and at what
// TM, from the Job column of the client's Item_SkillCardParam ("Warrior, Gladiator, Mercenary,
// Duelist[TM 101]" or "…, Duelist:260"). The wiki's job pages miss the newer TM 260 skill of each
// and say "TM +50" where the client asks for other numbers.
//
//   node scripts/client/build-hybrids.js [extraction folder]   (default G:/Claude/playtrickster-extraction)
"use strict";
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || "G:/Claude/playtrickster-extraction";
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8"));
const where = new Map(catalog.tables.map(t => [t.table.toLowerCase(), t.path]));
const cards = JSON.parse(fs.readFileSync(path.join(root, where.get("item_skillcardparam")), "utf8")).rows;
const builds = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/builds.json"), "utf8"));
const fixesFile = path.join(__dirname, "../../data/skill-fixes.json");
const fixes = JSON.parse(fs.readFileSync(fixesFile, "utf8"));

const TYPO = { Mercenery: "Mercenary", Mercernery: "Mercenary" };
// job -> { skill: TM } as the client's skill cards say
const learn = {};
for (const c of cards) {
  for (let part of String(c.Job || "").split(",")) {
    part = part.trim();
    const m = part.match(/^([A-Za-z ]+?)\s*(?:\[TM\s*(\d+)\]|:(\d+))?$/);
    if (!m) continue; // event cards ("For all characters", unreadable names)
    const job = TYPO[m[1].trim()] || m[1].trim();
    (learn[job] = learn[job] || {})[c.Name.trim()] = Number(m[2] || m[3] || c.TMLV);
  }
}

const hybrids = {};
for (const c of Object.values(builds.classes)) {
  for (const j of c.jobs) {
    if (!j.hybridOf) continue;
    const client = learn[j.name] || {};
    const other = new Map((builds.skills[j.hybridOf] || []).map(s => [s.name, s]));
    const mine = new Map((builds.skills[j.name] || []).map(s => [s.name, s]));
    const add = {}, tm = {};
    for (const [name, t] of Object.entries(client)) {
      if (!other.has(name)) continue; // own line, or a name the wiki spells another way
      if (!mine.has(name)) add[name] = t;
      else if (mine.get(name).tm !== t) tm[name] = t;
    }
    if (Object.keys(add).length || Object.keys(tm).length) hybrids[j.name] = { from: j.hybridOf, add, tm };
  }
}

const section = Object.assign({
  about: "Made by scripts/client/build-hybrids.js from the client's Item_SkillCardParam (Job column). Per hybrid job: add = skills of the other line it can learn that the wiki's job page leaves out (copied from that line, with this TM); tm = the TM the client asks of it. Not yet seen in game."
}, hybrids);
// only this part is written: the hand-written skill fixes above keep their layout
let text = fs.readFileSync(fixesFile, "utf8");
const nl = text.includes("\r\n") ? "\r\n" : "\n";
const at = text.search(/,\s*"hybrids"\s*:/);
if (at >= 0) text = text.slice(0, at) + nl + "}" + nl;
const end = text.lastIndexOf("}");
const body = JSON.stringify(section, null, 2).split("\n").map((l, i) => (i ? "  " + l : l)).join(nl);
text = text.slice(0, end).replace(/\s*$/, "") + "," + nl + '  "hybrids": ' + body + nl + "}" + nl;
JSON.parse(text);
fs.writeFileSync(fixesFile, text);
if (JSON.stringify(JSON.parse(text).skills) !== JSON.stringify(fixes.skills)) throw new Error("the skill fixes changed");
for (const [job, h] of Object.entries(hybrids)) console.log(job.padEnd(13), "add", JSON.stringify(h.add), "tm", JSON.stringify(h.tm));

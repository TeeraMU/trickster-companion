// data/bosses.json for the 👑 Boss page: the ggFTW wiki's boss pages (picture, seal, area, type, level,
// stats, skills, damage tolerance, summons, level restriction, spawn, walkthrough, notes, drops), the
// client's numbers from data/monsters.json (HP bars, resistances) and the app's quests about each boss.
//
//   node scripts/wiki/get-pages.js <dir> <names.txt>     (the boss names, one per line)
//   node scripts/wiki/build-bosses.js <dir>               -> data/bosses.json
"use strict";
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
if (!dir) { console.error("usage: node build-bosses.js <folder with the boss pages>"); process.exit(1); }
const WIKI_IMG = "https://wikimirror.lifeto.co/asset.103.ggftw.net/wiki/to-w/images/";

// in the order of the wiki's boss list (by area), with the app's quests about each one: the trial
// chain or the quest that opens the way, then quests asking for its drops
const BOSSES = [
  { name: "Tutankhamen", quests: ["db-pyr-02"] },
  { name: "Tombeth", quests: ["cr-boss-01"] },
  { name: "Captain Skull", quests: [] },
  { name: "Pirate King Karan", quests: ["gb-62"] },
  { name: "Count Blood", quests: [] },
  { name: "Tenter Lion", quests: ["bs-13"] },
  { name: "Queen Odinea", quests: ["sh-78", "sh-79", "tp-98", "tp-99"] },
  { name: "Soki", quests: [] },
  { name: "Spicy Dragon", quests: ["tp-31", "tp-37"] }
];
// the wiki's own column names -> the app's (same as the Planner's resistances)
const TOLERANCE = { Physical: "Physical", Magic: "Magic", Gun: "Gun", Fire: "Fire", Water: "Water", Air: "Wind", Soil: "Earth", Electric: "Elec", Light: "Light", Dark: "Dark", Shadow: "Shadow" };

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const text = h => String(h || "")
  .replace(/<br\s*\/?>/gi, " · ")
  .replace(/<[^>]+>/g, "")
  .replace(/&(#?\w+);/g, (m, e) => ENT[e] != null ? ENT[e] : /^#\d+$/.test(e) ? String.fromCharCode(+e.slice(1)) : m)
  .replace(/\s+/g, " ").replace(/^[\s·]+|[\s·]+$/g, "").trim();
const img = src => src ? WIKI_IMG + decodeURIComponent(src.replace(/^.*\/to-w\/images\//, "")) : "";
const cells = rowHtml => [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<\/td>|<td\b|$)/g)].map(m => m[1]);
// the row of cells after the header row holding `label`
function rowAfter(html, label) {
  const i = html.indexOf(`<b>${label}</b>`);
  if (i < 0) return [];
  const start = html.indexOf("<tr", html.indexOf("</tr>", i));
  const end = html.indexOf("</tr>", start);
  return cells(html.slice(start, end));
}
const num = s => { const n = Number(String(s).replace(/[^\d.]/g, "")); return String(s).replace(/[^\d]/g, "") ? n : null; };

/** Nested lists and paragraphs -> [{ d: depth, t: text }] (a "Trial N:" line gets trial: N). */
function lines(html) {
  const out = [];
  let depth = 0, buf = "";
  const flush = () => {
    const t = text(buf);
    buf = "";
    if (!t) return;
    const line = { d: Math.max(0, depth - 1), t };
    // a trial's heading ("Trial 1:", "Trial 2 - Vamp Lydia's Trial", "Blue Ice Trial 1 - …", "Path 1 Trials: …")
    if (depth <= 1 && t.length < 160 && /^[\w' -]*\bTrials?\b\s*\d*\s*[:\-–]/.test(t) && !/^(To proceed|Follow)/.test(t)) line.h = 1;
    out.push(line);
  };
  for (const part of html.split(/(<\/?ol>|<\/?ul>|<li>|<\/li>|<p>|<\/p>|<\/td>|<tr\b[^>]*>)/)) {
    if (/^<(ol|ul)>$/.test(part)) { flush(); depth++; }
    else if (/^<\/(ol|ul)>$/.test(part)) { flush(); depth--; }
    else if (/^<(li|\/li|p|\/p|\/td|tr)/.test(part)) flush();
    else buf += part;
  }
  flush();
  return out;
}

const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/monsters.json"), "utf8")).monsters;
const out = [];
for (const b of BOSSES) {
  const file = path.join(dir, b.name.replace(/ /g, "_") + ".html");
  const page = fs.readFileSync(file, "utf8");
  const html = page.slice(page.indexOf("<!-- start content -->"), page.indexOf("printfooter") > 0 ? page.indexOf("printfooter") : undefined);
  const left = html.slice(0, html.indexOf("</td>"));
  const pics = [...left.matchAll(/<img [^>]*src="([^"]+)"/g)].map(m => m[1]);
  const [type, level, weak, resist] = rowAfter(html, "Type").map(text);
  const [, element, hp, ap, ma, dp, md, gd] = rowAfter(html, "Active").map(text);
  const tolHead = rowAfter(html, "Damage Tolerance").map(text);
  const tolVals = (() => {
    const i = html.indexOf("<b>Damage Tolerance</b>");
    const headRow = html.indexOf("<tr", html.indexOf("</tr>", i));
    const valRow = html.indexOf("<tr", html.indexOf("</tr>", headRow));
    return cells(html.slice(valRow, html.indexOf("</tr>", valRow))).map(text);
  })();
  const tolerance = {};
  tolHead.forEach((h, i) => { if (TOLERANCE[h] && /\d/.test(tolVals[i] || "")) tolerance[TOLERANCE[h]] = num(tolVals[i]); });
  const skillsHtml = html.slice(html.indexOf("<b>Skills</b>"), html.indexOf("<b>Damage Tolerance</b>"));
  const skills = [...skillsHtml.matchAll(/<td><a [^>]*title="([^"]+)"[^>]*>[^<]*<\/a>\s*<\/td><td align="center">([^<]*)/g)]
    .map(m => ({ n: text(m[1]), lv: num(text(m[2])) })).map(s => s.lv == null ? { n: s.n } : s);
  const sumHtml = html.slice(html.indexOf("<b>Summon</b>"), html.indexOf("<b>Level Restriction</b>"));
  const sumRows = sumHtml.split(/<tr\b/).filter(r => !/display:none/.test(r.slice(0, 60)));
  const sumNames = (sumRows.find(r => /<a href="[^"]+" title=/.test(r) && !/class="image"/.test(r)) || "");
  const sumLvs = (sumRows.find(r => /Lv\.\d/.test(r)) || "");
  const lvs = cells(sumLvs).map(text);
  const summons = cells(sumNames).map(text).map((n, i) => n ? { n, lv: num(String(lvs[i] || "").replace(/^Lv\./, "")) } : null).filter(Boolean);
  const [restrict, spawn] = rowAfter(html, "Level Restriction").map(text);
  const part = (from, to) => {
    const i = html.indexOf(`<b>${from}</b>`);
    if (i < 0) return [];
    const s = html.indexOf("</tr>", i) + 5;
    let e = to ? html.indexOf(`<b>${to}</b>`, s) : -1;
    if (e < 0) e = html.indexOf("</table>", s);
    // up to the next section's header row (its <tr> is just before the label)
    return lines(html.slice(s, to && html.lastIndexOf("<tr", e) > s ? html.lastIndexOf("<tr", e) : e));
  };
  const walk = part("Walkthrough", "Notes");
  const notes = html.includes("<b>Notes</b>") ? part("Notes") : [];
  // drops: the sortable table after the box
  const dropHtml = html.slice(html.indexOf('class="sortable"'));
  const drops = dropHtml.slice(0, dropHtml.indexOf("</table>")).split(/<tr\b/).slice(2).map(r => {
    const c = cells(r);
    const pic = /src="([^"]+)"/.exec(c[0] || "");
    const d = { n: text(c[1]), use: text(c[2]) };
    if (pic) d.img = img(pic[1]);
    const rate = text(c[3]);
    if (rate) d.rate = rate;
    return d;
  }).filter(d => d.n);

  // the client's numbers for the same boss: the entry nearest the wiki's level, with HP bars first
  // (Spicy Dragon has a Lv.880 copy without bars besides the Lv.730 boss)
  const wikiLv = num(level) || 0;
  const mon = monsters.filter(m => m.n === b.name)
    .sort((x, y) => Math.abs(x.l - wikiLv) - Math.abs(y.l - wikiLv) || (y.bars || 0) - (x.bars || 0) || (y.boss || 0) - (x.boss || 0))[0];
  const area = text((/<b>([^<]*Boss)<\/b>/.exec(left) || [])[1]).replace(/\s*Boss$/, "");
  const rx = /Level (\d+)\s*(?:~\s*(\d+)|\+)/.exec(restrict || "");
  const boss = {
    name: b.name, area,
    img: img(pics.find(p => /\.png$/i.test(p)) || pics[0]),
    sprite: img(pics.find(p => /\.gif$/i.test(p) && !/Seal/i.test(p))),
    seal: img(pics.find(p => /Seal/i.test(p))),
    type, level: num(level), weak: weak && weak !== "-" ? weak : "", resist: resist && resist !== "-" ? resist : "",
    location: text((/<b>Location<\/b>[\s\S]*?<tr>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(html) || [])[1]),
    wiki: { element, hp, ap, ma, dp, md, gd },
    tolerance, skills, summons,
    levels: rx ? [+rx[1], rx[2] ? +rx[2] : null] : null, restrict: restrict || "", spawn: spawn || "",
    walk, notes, drops,
    quests: b.quests,
    monster: mon ? mon.id : null
  };
  for (const k of ["sprite", "seal"]) if (!boss[k]) delete boss[k];
  out.push(boss);
}

const file = path.join(__dirname, "../../data/bosses.json");
fs.writeFileSync(file, JSON.stringify({
  source: "ggFTW Trickster wiki boss pages (wikimirror.lifeto.co); numbers in Battle Summary from the PlayTrickster client (data/monsters.json)",
  made: new Date().toISOString().slice(0, 10),
  missing: ["Koiosu", "True Kronos"],
  bosses: out
}, null, 1) + "\n");
for (const b of out) console.log(`${b.name.padEnd(18)} ${b.area.padEnd(16)} Lv.${b.level} ${b.levels} walk ${b.walk.length} (headings ${b.walk.filter(l => l.h).length}) notes ${b.notes.length} skills ${b.skills.length} summons ${b.summons.length} drops ${b.drops.length} tol ${Object.keys(b.tolerance).length} mon ${b.monster} seal ${!!b.seal}`);

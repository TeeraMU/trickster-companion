// scripts/wiki/monster-pics.json: the wiki picture each monster in data/monsters.json can use. Most of
// the client's monsters are variants the wiki has no page for (Chaos Cut Throat, Requiem …, Confused …):
// they take the picture of the monster their name ends with (Cut Throat). "" = no picture anywhere.
// Asks the wiki mirror (HEAD requests); names already in the file are kept unless --all.
// build-monsters.js reads the file.
//
//   node scripts/wiki/check-monster-pics.js [--all]
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const BASE = "https://wikimirror.lifeto.co/asset.103.ggftw.net/wiki/to-w/images/";
const cacheFile = path.join(__dirname, "monster-pics.json");
const mons = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/monsters.json"), "utf8")).monsters;
// a name that is also a class, a job or too plain would bring a character's or another thing's picture
const builds = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/builds.json"), "utf8"));
const NOT_A_MONSTER = new Set([...Object.keys(builds.classes), ...Object.values(builds.classes).flatMap(c => c.jobs.map(j => j.name)), "Guard", "Stone"].map(n => n.toLowerCase()));
const cache = !process.argv.includes("--all") && fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")).pics : {};

// MediaWiki keeps File:X under md5(X)[0]/md5(X)[0..1]/X
const wikiPath = (name, ext) => {
  const file = (name.charAt(0).toUpperCase() + name.slice(1)).replace(/ /g, "_") + "." + ext;
  const h = crypto.createHash("md5").update(file).digest("hex");
  return `${h[0]}/${h.slice(0, 2)}/${file}`;
};
const known = new Map(); // path -> exists
const head = p => known.has(p) ? Promise.resolve(known.get(p)) : new Promise(done => {
  const req = https.request(BASE + p, { method: "HEAD", timeout: 20000 }, res => { res.resume(); known.set(p, res.statusCode === 200); done(known.get(p)); });
  req.on("error", () => done(false));
  req.on("timeout", () => { req.destroy(); done(false); });
  req.end();
});
// the name itself, then without its first word, and so on ("Chaos Cut Throat", "Cut Throat", "Throat")
async function find(name) {
  const words = name.split(" ");
  const title = w => w.charAt(0).toUpperCase() + w.slice(1);
  for (let i = 0; i < words.length; i++) {
    const n = words.slice(i).join(" ");
    if (n.length < 3 || (i > 0 && NOT_A_MONSTER.has(n.toLowerCase()))) break;
    // as the client writes it, then each word capitalised ("Tenter lion" is the wiki's Tenter Lion)
    for (const v of [...new Set([n, words.slice(i).map(title).join(" ")])])
      for (const ext of ["png", "gif"]) if (await head(wikiPath(v, ext))) return wikiPath(v, ext);
  }
  return "";
}

(async () => {
  const names = [...new Set(mons.map(m => m.n))].filter(n => !(n in cache));
  let i = 0;
  const worker = async () => { while (i < names.length) { const n = names[i++]; cache[n] = await find(n); } };
  await Promise.all(Array.from({ length: 12 }, worker));
  const pics = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(cacheFile, JSON.stringify({
    about: "Wiki picture path (under " + BASE + ") per monster name, from scripts/wiki/check-monster-pics.js; \"\" = none found",
    made: new Date().toISOString().slice(0, 10), pics
  }, null, 0) + "\n");
  const all = [...new Set(mons.map(m => m.n))];
  const own = all.filter(n => pics[n] && pics[n].includes("/" + n.replace(/ /g, "_") + ".")).length;
  const borrowed = all.filter(n => pics[n] && !pics[n].includes("/" + n.replace(/ /g, "_") + ".")).length;
  console.log(`${all.length} names: ${own} own picture, ${borrowed} from the monster their name ends with, ${all.length - own - borrowed} none`);
})();

#!/usr/bin/env node
// Checks data/*.json: required fields, unique ids, known enums, references between files,
// and no prerequisite loops. Run: node scripts/validate.js   (exit code 1 on errors)
"use strict";
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const read = p => JSON.parse(fs.readFileSync(path.join(DATA, p), "utf8"));

const CATEGORIES = ["episode", "general", "card", "monster", "dungeon", "daily", "key", "sticker", "job", "guardian"];
const SOURCE_KINDS = ["drop", "drill", "quest", "compound", "shop"];
const CLASSES = ["bunny", "buffalo", "white-bear", "sheep", "dragon", "fox", "lion", "cat", "raccoon"];

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const isInt = (v, min = 0) => Number.isInteger(v) && v >= min;
const isStr = v => typeof v === "string" && v.trim() !== "";

// --- load ---------------------------------------------------------------------------------
const index = read("quests/index.json");
if (index.schemaVersion !== 2) err("quests/index.json", `schemaVersion must be 2, got ${index.schemaVersion}`);
const npcs = read("npcs.json");
const images = read("images.json");
const npcIds = new Set();
for (const n of npcs) {
  if (!isStr(n.id) || !isStr(n.name)) err("npcs.json", `bad entry ${JSON.stringify(n)}`);
  if (npcIds.has(n.id)) err("npcs.json", `duplicate id ${n.id}`);
  npcIds.add(n.id);
}
for (const [name, url] of Object.entries(images)) {
  if (!/^https:\/\//.test(url)) err("images.json", `"${name}" is not an https URL`);
}

const quests = [];
for (const file of index.files) {
  const data = read("quests/" + file);
  if (!isStr(data.region)) err(file, "missing region");
  for (const q of data.quests) quests.push({ q, file });
}

// --- per-quest checks ----------------------------------------------------------------------
const byId = new Map();
const usedNpcs = new Set();
for (const { q, file } of quests) {
  const at = `${file} ${q.id || "(no id)"}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.id || "")) err(at, "id must be lowercase-with-dashes");
  if (byId.has(q.id)) err(at, `duplicate id (also in ${byId.get(q.id).file})`);
  byId.set(q.id, { q, file });

  for (const k of ["title", "chapter", "npc", "location", "prereqText"]) if (!isStr(q[k])) err(at, `missing ${k}`);
  if ("area" in q && !isStr(q.area)) err(at, "area must be a non-empty text");
  if ("path" in q && !/^[a-z]+(-[a-z]+)*$/.test(q.path)) err(at, "path must be a lowercase id like \"soul-master\"");
  if (!isInt(q.order, 1)) err(at, "order must be a positive integer");
  if (!isInt(q.minLevel, 1)) err(at, "minLevel must be a positive integer");
  if (!isInt(q.cycles, 1)) err(at, "cycles must be a positive integer");

  if (!Array.isArray(q.categories) || !q.categories.length) err(at, "categories must be a non-empty list");
  else for (const c of q.categories) if (!CATEGORIES.includes(c)) err(at, `unknown category "${c}"`);

  if (!Array.isArray(q.classes) || !q.classes.length) err(at, "classes must be a non-empty list");
  else for (const c of q.classes) {
    const name = c.replace(/^!/, "");
    if (c !== "all" && !CLASSES.includes(name)) err(at, `unknown class "${c}"`);
  }

  if (!Array.isArray(q.npcIds) || !q.npcIds.length) err(at, "npcIds must be a non-empty list");
  else for (const id of q.npcIds) {
    if (!npcIds.has(id)) err(at, `npc "${id}" is not in npcs.json`);
    usedNpcs.add(id);
  }

  if (!Array.isArray(q.steps) || !q.steps.length || !q.steps.every(isStr)) err(at, "steps must be a non-empty list of text");

  for (const [i, o] of (q.objectives || []).entries()) {
    const ot = `${at} objective ${i + 1}`;
    if (o.type === "collect") {
      if (!isStr(o.item)) err(ot, "missing item");
      if (!isInt(o.qty, 1)) err(ot, "qty must be a positive integer");
      if (o.total !== undefined && !isInt(o.total, 1)) err(ot, "total must be a positive integer");
      if (!o.source || !SOURCE_KINDS.includes(o.source.kind)) err(ot, `unknown source kind "${o.source && o.source.kind}"`);
      else {
        if (!isStr(o.source.from)) err(ot, "missing source.from");
        if (!isStr(o.source.map)) err(ot, "missing source.map");
      }
    } else if (o.type === "hunt") {
      if (!isStr(o.monster)) err(ot, "missing monster");
      if (!isInt(o.count, 1)) err(ot, "count must be a positive integer");
      if (!isStr(o.map)) err(ot, "missing map");
    } else err(ot, `unknown objective type "${o.type}"`);
  }

  const r = q.rewards || {};
  for (const k of ["baseExp", "tmExp", "galder"]) if (!isInt(r[k])) err(at, `rewards.${k} must be a whole number`);
  if (!Array.isArray(r.items)) err(at, "rewards.items must be a list");
}

// --- cross-quest checks --------------------------------------------------------------------
// quests by title ("NPC - Title" and the title alone), for the quests a prereqText names
const normTitle = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const byTitle = new Map();
for (const { q } of quests) {
  byTitle.set(normTitle(q.title), q);
  const t = normTitle(q.title.split(" - ").slice(1).join(" - "));
  if (t && !byTitle.has(t)) byTitle.set(t, q);
}
// "Level 230+, have completed A - B and C - D" -> ["A - B", "C - D"]
const namedQuests = text => String(text || "").split(/,|;| and /)
  .map(s => s.replace(/^.*?\b(have completed|finished|have)\s+/i, "").replace(/\s+in quest log.*$|\s+\d+ times$/i, "").trim())
  .filter(s => / - [A-Z]/.test(s));
const notInApp = new Set();
// the titles (without a "(variant)" ending) of every quest q needs, directly or through the chain
function chainTitles(q, out = new Set(), seen = new Set()) {
  for (const p of q.prereqs || []) {
    if (seen.has(p.quest) || !byId.has(p.quest)) continue;
    seen.add(p.quest);
    const o = byId.get(p.quest).q;
    out.add(normTitle(o.title.replace(/\s*\([^)]*\)\s*$/, "")));
    chainTitles(o, out, seen);
  }
  return out;
}
// does q need `id`, directly or through its prerequisites' prerequisites?
function reaches(q, id, seen = new Set()) {
  for (const p of q.prereqs || []) {
    if (p.quest === id) return true;
    if (seen.has(p.quest) || !byId.has(p.quest)) continue;
    seen.add(p.quest);
    if (reaches(byId.get(p.quest).q, id, seen)) return true;
  }
  return false;
}
for (const { q, file } of quests) {
  const at = `${file} ${q.id}`;
  for (const p of q.prereqs || []) {
    if (!byId.has(p.quest)) err(at, `prerequisite "${p.quest}" does not exist`);
    if (p.quest === q.id) err(at, "quest requires itself");
  }
  // prereqText names a quest ("NPC - Title") the app has but prereqs doesn't link: a link was missed.
  // One the app doesn't have (no wiki page) is only counted.
  for (const name of namedQuests(q.prereqText)) {
    const other = byTitle.get(normTitle(name)) || byTitle.get(normTitle(name.split(" - ").slice(1).join(" - ")));
    if (!other) { notInApp.add(name); continue; }
    if (other.id === q.id || reaches(q, other.id)) continue; // linked, or through the chain (job3-05 -> job3-04 -> … -> job3-03)
    // the same quest in another variant (Calm Down Suu (Maze Jungle B) when A is linked)
    const base = t => normTitle(t.replace(/\s*\([^)]*\)\s*$/, ""));
    // or a copy of it in the chain (ep6-31 "King Poppuri - Holy Preparations?" is ae-05 in the episode)
    if (chainTitles(q).has(base(other.title))) continue;
    warn(at, `prereqText names ${other.id} (${other.title}) but prereqs doesn't link it`);
  }
  // A quest needing another one *finished* should come after it in play order.
  for (const p of q.prereqs || []) {
    const other = byId.get(p.quest);
    if (other && !p.active && other.q.order > q.order) warn(at, `comes before its prerequisite ${p.quest} (order ${q.order} < ${other.q.order})`);
  }
}

// Loops among prerequisites. "Active" ones count too: the app unlocks a quest that needs another one
// accepted only once that one is itself unlocked, so any loop locks every quest in it for good
// (EP1 Ch.1 had one: Sabrina needed Old Artist's Needs accepted, which needed Sabrina finished).
const state = new Map(); // id -> 1 visiting, 2 done
function visit(id, trail) {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) { err("prerequisites", `loop (these quests can never unlock): ${[...trail.slice(trail.indexOf(id)), id].join(" -> ")}`); return; }
  state.set(id, 1);
  const node = byId.get(id);
  for (const p of (node ? node.q.prereqs : []) || []) if (byId.has(p.quest)) visit(p.quest, [...trail, (p.active ? "~" : "") + id].map(x => x.replace(/^~~/, "~")));
  state.set(id, 2);
}
for (const id of byId.keys()) visit(id, []);

for (const id of npcIds) if (!usedNpcs.has(id)) warn("npcs.json", `"${id}" is not used by any quest`);

// --- maps.json: every map text in the quests resolves, links point at real maps -------------
const maps = read("maps.json");
const mapIds = new Set(maps.maps.map(m => m.id));
const regionIds = new Set(maps.regions.map(r => r.id));
for (const m of maps.maps) {
  const at = `maps.json ${m.id}`;
  if (!regionIds.has(m.region)) err(at, `unknown region "${m.region}"`);
  if (!m.box && !mapIds.has(m.parent)) err(at, "needs a box on the region map or a parent map");
  if (m.box && !(m.box.length === 4 && m.box[2] > m.box[0] && m.box[3] > m.box[1])) err(at, "box must be [x1, y1, x2, y2]");
  for (const l of m.links) {
    if (!mapIds.has(l)) err(at, `links to unknown map "${l}"`);
    else if (!maps.maps.find(x => x.id === l).links.includes(m.id)) err(at, `link to "${l}" is one-way`);
  }
}
for (const [text, ids] of Object.entries(maps.names)) for (const id of ids) if (!mapIds.has(id)) err(`maps.json names`, `"${text}" -> unknown map "${id}"`);
const mapTexts = new Set();
for (const { q } of quests) {
  mapTexts.add(q.location);
  for (const o of q.objectives || []) mapTexts.add(o.type === "hunt" ? o.map : o.source && o.source.map);
}
for (const t of mapTexts) if (t && !(t in maps.names)) err("maps.json names", `quest map text "${t}" is not listed (add it with the map ids it means)`);
for (const t of Object.keys(maps.names)) if (!mapTexts.has(t)) warn("maps.json names", `"${t}" is not used by any quest`);

// --- item-sources.json: source fixes point at real items, quests and map texts ------------------
if (fs.existsSync(path.join(DATA, "item-sources.json"))) {
  const fixes = read("item-sources.json").items || {};
  const used = new Set(quests.flatMap(({ q }) => (q.objectives || []).filter(o => o.type === "collect").map(o => o.item)));
  for (const [item, s] of Object.entries(fixes)) {
    const at = `item-sources.json "${item}"`;
    if (!used.has(item)) warn(at, "no quest collects this item");
    if (!SOURCE_KINDS.includes(s.kind)) err(at, `unknown kind "${s.kind}"`);
    if (!isStr(s.from)) err(at, "missing from");
    if (!isStr(s.map)) err(at, "missing map");
    else if (!(s.map in maps.names)) err(at, `map text "${s.map}" is not listed in maps.json names`);
    for (const id of s.quests || []) {
      const g = byId.get(id);
      if (!g) { err(at, `quest "${id}" does not exist`); continue; }
      if (!(g.q.rewards.items || []).some(r => new RegExp("^(?:Cycle \\d+: )?\\d+x " + item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$").test(r) || r.includes("x " + item)))
        warn(at, `quest "${id}" doesn't list ${item} in its rewards`);
    }
  }
}

// --- npc-pins.json: pins point at real NPCs and maps -------------------------------------------
const pins = read("npc-pins.json");
for (const [key, p] of Object.entries(pins)) {
  const [npc, map] = key.split("@");
  if (!map) { err("npc-pins.json", `"${key}" must be "npcId@mapId"`); continue; }
  if (!npcIds.has(npc)) err("npc-pins.json", `${key}: unknown NPC "${npc}"`);
  if (!mapIds.has(map)) err("npc-pins.json", `${key}: unknown map "${map}"`);
  if (!(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)) err("npc-pins.json", `${key}: x / y must be 0-100 (%)`);
  if (p.src && p.src !== "wiki") err("npc-pins.json", `${key}: src must be "wiki" when set`);
}

// --- report --------------------------------------------------------------------------------
for (const w of warnings) console.warn("warning  " + w);
for (const e of errors) console.error("ERROR    " + e);
console.log(`\n${quests.length} quests in ${index.files.length} files, ${npcIds.size} NPCs, ${Object.keys(images).length} images, ` +
  `${mapIds.size} maps (${Object.keys(maps.names).length} map names), ${Object.keys(pins).length} NPC pins: ` +
  `${errors.length} error(s), ${warnings.length} warning(s)` +
  (notInApp.size ? `\n(${notInApp.size} prerequisite quests named in the text have no wiki page, so they aren't in the app)` : ""));
process.exit(errors.length ? 1 : 0);

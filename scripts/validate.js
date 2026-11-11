#!/usr/bin/env node
// Checks data/*.json: required fields, unique ids, known enums, references between files,
// and no prerequisite loops. Run: node scripts/validate.js   (exit code 1 on errors)
"use strict";
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const read = p => JSON.parse(fs.readFileSync(path.join(DATA, p), "utf8"));

const CATEGORIES = ["episode", "general", "monster", "dungeon", "daily", "key", "sticker", "job"];
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
for (const { q, file } of quests) {
  const at = `${file} ${q.id}`;
  for (const p of q.prereqs || []) {
    if (!byId.has(p.quest)) err(at, `prerequisite "${p.quest}" does not exist`);
    if (p.quest === q.id) err(at, "quest requires itself");
  }
  // A quest needing another one *finished* should come after it in play order.
  for (const p of q.prereqs || []) {
    const other = byId.get(p.quest);
    if (other && !p.active && other.q.order > q.order) warn(at, `comes before its prerequisite ${p.quest} (order ${q.order} < ${other.q.order})`);
  }
}

// Loops among "must be finished first" prerequisites ("active" ones only need the other quest accepted).
const state = new Map(); // id -> 1 visiting, 2 done
function visit(id, trail) {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) { err("prerequisites", `loop: ${[...trail, id].join(" -> ")}`); return; }
  state.set(id, 1);
  const node = byId.get(id);
  for (const p of (node ? node.q.prereqs : []) || []) if (!p.active && byId.has(p.quest)) visit(p.quest, [...trail, id]);
  state.set(id, 2);
}
for (const id of byId.keys()) visit(id, []);

for (const id of npcIds) if (!usedNpcs.has(id)) warn("npcs.json", `"${id}" is not used by any quest`);

// --- report --------------------------------------------------------------------------------
for (const w of warnings) console.warn("warning  " + w);
for (const e of errors) console.error("ERROR    " + e);
console.log(`\n${quests.length} quests in ${index.files.length} files, ${npcIds.size} NPCs, ${Object.keys(images).length} images: ` +
  `${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);

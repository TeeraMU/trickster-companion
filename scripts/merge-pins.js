#!/usr/bin/env node
// Merge NPC pins sent by players into data/npc-pins.json.
//
//   node scripts/merge-pins.js answers.csv                     # the Report form's Google Sheet (File > Download > CSV)
//   node scripts/merge-pins.js pins-from-ann.json chat.txt     # files: exported JSON or pasted chat text
//   node scripts/merge-pins.js --issues                        # open GitHub issues labelled "pins" (needs gh)
//   add --dry-run to only print the report
//
// Rules: unknown NPC / map -> skipped; NPC not pinned yet -> added; same map and within 5% of the
// picture -> averaged (weighted by how many people agreed, kept in `n`); different spot or map ->
// left as it is and listed as a conflict for you to decide.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DATA = path.join(__dirname, "..", "data");
const REPO = "TeeraMU/trickster-companion";
const NEAR = 5; // % of the map picture
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fromIssues = args.includes("--issues");
const files = args.filter(a => !a.startsWith("--"));

const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const npcIds = new Set(read(path.join(DATA, "npcs.json")).map(n => n.id));
const mapIds = new Set(read(path.join(DATA, "maps.json")).maps.map(m => m.id));
const pinsPath = path.join(DATA, "npc-pins.json");
const pins = read(pinsPath);

/** The first {...} JSON object in a text (exported file, pasted chat message or issue body). */
function extractPins(text) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no pins found");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("pins text is cut off");
}

/** Minimal CSV parser (quoted fields, "" escapes, newlines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

const sources = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8").replace(/^﻿/, "");
  if (!f.toLowerCase().endsWith(".csv")) { sources.push({ name: path.basename(f), text }); continue; }
  // Google Sheet export of the Report form: one source per answer that has pins
  const [head, ...rows] = parseCsv(text);
  const pinCol = head.findIndex(h => /NPC pins/i.test(h));
  const nameCol = head.findIndex(h => /name in game/i.test(h));
  const timeCol = head.findIndex(h => /timestamp|ประทับเวลา/i.test(h));
  if (pinCol < 0) { console.log(`${path.basename(f)}: no "NPC pins" column, skipped`); continue; }
  rows.forEach((r, i) => {
    if (!(r[pinCol] || "").trim()) return;
    const who = [r[nameCol], r[timeCol]].filter(Boolean).join(", ");
    sources.push({ name: `sheet row ${i + 2}${who ? ` (${who})` : ""}`, text: r[pinCol] });
  });
}
if (fromIssues) {
  const out = execFileSync("gh", ["issue", "list", "--repo", REPO, "--label", "pins", "--state", "open",
    "--json", "number,author,body", "--limit", "100"], { encoding: "utf8" });
  for (const is of JSON.parse(out)) sources.push({ name: `issue #${is.number} (${is.author.login})`, text: is.body, issue: is.number });
}
if (!sources.length) {
  console.log("Nothing to merge. Give exported files / pasted text, or --issues.");
  process.exit(0);
}

const report = { added: [], averaged: [], conflicts: [], skipped: [], same: [] };
const merged = [];
for (const src of sources) {
  let incoming;
  try { incoming = extractPins(src.text); } catch (e) { report.skipped.push(`${src.name}: ${e.message}`); continue; }
  for (const [npc, p] of Object.entries(incoming)) {
    const at = `${npc} (${src.name})`;
    if (!npcIds.has(npc)) { report.skipped.push(`${at}: unknown NPC`); continue; }
    if (!mapIds.has(p.map)) { report.skipped.push(`${at}: unknown map "${p.map}"`); continue; }
    if (!(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)) { report.skipped.push(`${at}: x / y out of range`); continue; }
    const cur = pins[npc];
    if (!cur) { pins[npc] = { map: p.map, x: p.x, y: p.y, n: 1 }; report.added.push(at); continue; }
    const dist = Math.hypot(cur.x - p.x, cur.y - p.y);
    if (cur.map === p.map && dist <= NEAR) {
      const n = cur.n || 1;
      if (dist === 0) { report.same.push(at); continue; }
      cur.x = Math.round((cur.x * n + p.x) / (n + 1) * 10) / 10;
      cur.y = Math.round((cur.y * n + p.y) / (n + 1) * 10) / 10;
      cur.n = n + 1;
      report.averaged.push(`${at}: ${n + 1} people agree`);
    } else {
      report.conflicts.push(`${at}: sent ${p.map} (${p.x}, ${p.y}) but data has ${cur.map} (${cur.x}, ${cur.y})`);
    }
  }
  if (src.issue) merged.push(src.issue);
}

const show = (title, list) => list.length && console.log(`\n${title} (${list.length})\n  ` + list.join("\n  "));
show("Added", report.added);
show("Averaged", report.averaged);
show("Already there", report.same);
show("CONFLICTS: kept the current pin, decide by hand", report.conflicts);
show("Skipped", report.skipped);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
} else {
  const sorted = Object.fromEntries(Object.keys(pins).sort().map(k => [k, pins[k]]));
  fs.writeFileSync(pinsPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\nWrote data/npc-pins.json (${Object.keys(sorted).length} NPCs). Run node scripts/validate.js, then commit.`);
  if (merged.length) {
    console.log("After pushing, close the merged issues:\n  " +
      merged.map(n => `gh issue close ${n} --repo ${REPO} -c "Merged, thanks!"`).join("\n  "));
  }
}

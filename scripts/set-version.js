// Puts the app version in index.html: APP_VERSION (shown in ⚙️ Settings -> What's new) and ?v=X.Y.Z on every
// css/ and js/ link, so a browser can't mix a new index.html with an old cached app.css or planner.js
// (GitHub Pages lets browsers keep them 10 minutes). Run it on the release branch, before merging into main.
// usage: node scripts/set-version.js 1.1.0        (node scripts/set-version.js --check: only says what's there)
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
const arg = process.argv[2] || "";
let html = fs.readFileSync(file, "utf8");

const ASSET = /((?:href|src)=")((?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w.-]*)?(")/g;
const VERSION = /(const APP_VERSION = ")([\w.-]*)(";)/;

if (arg === "--check" || !arg) {
  const now = (VERSION.exec(html) || [])[2] || "(none)";
  const links = [...html.matchAll(ASSET)].map(m => m[0].replace(/^(href|src)="/, "").replace(/"$/, ""));
  const off = links.filter(l => !l.endsWith("?v=" + now));
  console.log(`APP_VERSION ${now}; ${links.length} css/js links, ${off.length} without ?v=${now}${off.length ? ": " + off.join(", ") : ""}`);
  if (!arg) console.log("usage: node scripts/set-version.js X.Y.Z");
  process.exit(off.length || now === "(none)" ? 1 : 0);
}

if (!/^\d+\.\d+\.\d+$/.test(arg)) {
  console.error("The version is three numbers, e.g. 1.1.0");
  process.exit(1);
}
if (!VERSION.test(html)) {
  console.error("index.html has no `const APP_VERSION = \"...\";`");
  process.exit(1);
}
let n = 0;
html = html.replace(ASSET, (_, a, url, b) => { n++; return `${a}${url}?v=${arg}${b}`; });
html = html.replace(VERSION, (_, a, __, b) => `${a}${arg}${b}`);
fs.writeFileSync(file, html);
console.log(`index.html: APP_VERSION ${arg}, ?v=${arg} on ${n} css/js links`);

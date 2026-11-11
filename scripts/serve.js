#!/usr/bin/env node
// Tiny static server for local testing (the app reads data/*.json with fetch, which browsers
// block for file:// pages). Usage: node scripts/serve.js [port]   (default 8080)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("Forbidden"); return; }
  if (urlPath.endsWith("/")) file = path.join(file, "index.html");
  fs.readFile(file, (e, body) => {
    if (e) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  });
}).listen(PORT, () => console.log(`Trickster Companion: http://localhost:${PORT}/`));

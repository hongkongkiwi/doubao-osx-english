#!/usr/bin/env node
/* Merges mt-work/out-*.json results into lib/dictionary-mt.json. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const MT_PATH = path.join(ROOT, "lib", "dictionary-mt.json");
let merged = {};
if (fs.existsSync(MT_PATH)) {
  try { merged = JSON.parse(fs.readFileSync(MT_PATH, "utf8")); } catch { console.error("existing dictionary-mt.json is invalid JSON — starting fresh"); }
}
const curated = require(path.join(ROOT, "lib", "dictionary.js"));
let added = 0, skipped = 0;
for (const f of fs.readdirSync(path.join(ROOT, "mt-work")).filter(f => f.startsWith("out-") && f.endsWith(".json"))) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, "mt-work", f), "utf8"));
    for (const [zh, en] of Object.entries(j)) {
      if (typeof en !== "string" || !en.trim()) continue;
      if (curated[zh]) { skipped++; continue; } // curated wins
      if (merged[zh] !== en) added++;
      merged[zh] = en;
    }
  } catch (e) { console.error("skip", f, e.message); }
}
fs.writeFileSync(MT_PATH, JSON.stringify(merged, null, 1));
console.log(`merged: +${added} changed, ${skipped} skipped (curated override), total ${Object.keys(merged).length}`);

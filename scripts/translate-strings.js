#!/usr/bin/env node
/*
 * Bulk machine-translation scaffold for the extracted long tail.
 *
 * Reads a string list (one per line), translates via any OpenAI-compatible
 * endpoint, and writes a dictionary-merge JSON: { "中文": "English", ... }.
 * Save the output to ~/Library/Application Support/DoubaoEN/user-dictionary.json
 * or lib/dictionary-mt.json (both merge over the embedded dictionary).
 *
 * Environment:
 *   MT_URL    chat-completions endpoint (e.g. http://127.0.0.1:20128/v1/chat/completions)
 *   MT_KEY    bearer key
 *   MT_MODEL  model id
 *   MT_BATCH  strings per request (default 40)
 *
 * Usage: node scripts/translate-strings.js untranslated.txt out.json
 */
"use strict";
const fs = require("node:fs");
const URL_ = process.env.MT_URL;
const KEY = process.env.MT_KEY || "";
const MODEL = process.env.MT_MODEL || "gpt-4o-mini";
const BATCH = Number(process.env.MT_BATCH || 40);
const [inFile, outFile] = process.argv.slice(2);
if (!URL_ || !inFile || !outFile) { console.error("usage: MT_URL=... MT_MODEL=... node translate-strings.js in.txt out.json"); process.exit(1); }

const strings = fs.readFileSync(inFile, "utf8").split("\n").map(s => s.trim()).filter(s => s.length > 1 && s.length <= 120);
console.log(`translating ${strings.length} strings in batches of ${BATCH}`);
const out = JSON.parse(fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "{}");
const protect = (s) => s.replace(/%(\d+\$)?[sd]/g, m => "\u0001" + m + "\u0001");
const restore = (s, n) => s.replace(/\u0001(%\d+\$?[sd])\u0001/g, (_, p) => p);

async function translate(batch) {
  const payload = {};
  for (const s of batch) payload[protect(s)] = "";
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(KEY ? { Authorization: "Bearer " + KEY } : {}) },
    body: JSON.stringify({ model: MODEL, temperature: 0, messages: [
      { role: "system", content: "You are a localization engine for a desktop AI-assistant app. Translate each Simplified Chinese UI string to concise natural English UI text. Keep placeholders (keys wrapped in \u0001, and {tokens} like {fileName}) exactly as written. Respond with ONLY a JSON object: {original: translation, ...}. Every key must be present." },
      { role: "user", content: JSON.stringify(payload) },
    ] }),
  });
  const j = await r.json().catch(() => null);
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error("no content: HTTP " + r.status);
  const m = content.match(/\{[\s\S]*\}/);
  return JSON.parse(m[0].replace(/\u0001/g, ""));
}

(async () => {
  let done = 0;
  for (let i = 0; i < strings.length; i += BATCH) {
    const batch = strings.slice(i, i + BATCH).filter(s => !out[s]);
    if (!batch.length) continue;
    try {
      const t = await translate(batch);
      for (const [zh, en] of Object.entries(t)) if (en && typeof en === "string") { out[zh] = en; done++; }
      process.stdout.write(`\r${Math.min(i + BATCH, strings.length)}/${strings.length}`);
    } catch (e) { console.log("\nbatch failed:", e.message); }
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(`\ntranslated ${done}; wrote ${Object.keys(out).length} entries -> ${outFile}`);
})();

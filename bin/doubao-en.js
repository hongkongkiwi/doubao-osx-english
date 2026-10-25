#!/usr/bin/env node
/*
 * Doubao EN — launcher & injector.
 *
 * Ensures the Doubao desktop app is running with a local DevTools port,
 * then injects lib/translator.js (with lib/dictionary.js) into every Doubao
 * page target. Watches for new windows/tabs and injects those too.
 *
 * Modes:
 *   doubao-en            inject and keep watching (default)
 *   doubao-en --once     inject into current targets and exit
 *   doubao-en --collect  also dump visible untranslated Chinese strings to
 *                        doubao-en-strings.txt (for extending the dictionary)
 *   doubao-en --no-launch  never start/quit the app; only attach to a
 *                        DevTools port that is already open
 *
 * Environment:
 *   DOUBAO_EN_PORT  DevTools port (default 9223)
 *   DOUBAO_APP      path to Doubao.app (default /Applications/Doubao.app)
 */
"use strict";

const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.DOUBAO_EN_PORT || 9223);
const APP = process.env.DOUBAO_APP || "/Applications/Doubao.app";
const BASE = `http://127.0.0.1:${PORT}`;
const ONCE = process.argv.includes("--once");
const COLLECT = process.argv.includes("--collect");
const NO_LAUNCH = process.argv.includes("--no-launch");
const SHOT_ARG = process.argv.indexOf("--screenshot");
const SHOT = SHOT_ARG > -1 ? (process.argv[SHOT_ARG + 1] && !process.argv[SHOT_ARG + 1].startsWith("--") ? process.argv[SHOT_ARG + 1] : "doubao-en.png") : null;
const TARGET_URL = /^(doubao:|https?:\/\/[^/]*doubao\.com)/i;

const transSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "translator.js"), "utf8");

// Merge the embedded dictionary with an optional user dictionary, so new
// strings can be added without reinstalling the wrapper app.
const USER_DICT_PATH = process.env.DOUBAO_EN_USER_DICT
  || path.join(process.env.HOME || "/tmp", "Library", "Application Support", "DoubaoEN", "user-dictionary.json");
let userDict = {};
try { userDict = JSON.parse(fs.readFileSync(USER_DICT_PATH, "utf8")); } catch {}
const dict = { ...require(path.join(__dirname, "..", "lib", "dictionary.js")), ...userDict };
const dictSrc = `window.DOUBAO_EN_DICT = ${JSON.stringify(dict)};`;

// Placeholder templates ("%s 分钟前", "{fileName} 上传失败") never match exact
// lookup after the app interpolates them, so each becomes a regex rule:
// zh template -> anchored pattern with capture groups, en -> replacement
// whose {token} refs map back to the groups.
const RULES = [];
for (const [zh, en] of Object.entries(dict)) {
  if (!en || !/(\{[^{}]+\}|%\d+\$?s|%s|%d)/.test(zh)) continue;
  const tokens = [];
  const zhRx = zh
    .replace(/\{[^{}]+\}|%\d+\$?[sd]|%s|%d/g, (m) => { tokens.push(m); return "\u0000" + (tokens.length - 1) + "\u0000"; })
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // string placeholders capture a short run without separators; %d captures digits
  const rx = "^" + zhRx.replace(/\u0000(\d+)\u0000/g, (_, i) => (/%d$/.test(tokens[i]) ? "(\\d{1,6})" : "([^|]{0,40}?)")) + "$";
  // EN: {token} -> its group; bare %s/%d map to groups in order of appearance
  let n = 0;
  let rep = en.replace(/\{([^{}]+)\}/g, (m, tok) => {
    const idx = tokens.indexOf("{" + tok + "}");
    return idx === -1 ? "" : "$" + (idx + 1);
  });
  rep = rep.replace(/%(\d+)\$?[sd]/g, (m, num) => "$" + num);
  rep = rep.replace(/%[sd]/g, () => "$" + (++n));
  RULES.push([rx, rep]);
}
const rulesSrc = `window.DOUBAO_EN_RULES = ${JSON.stringify(RULES)};`;
const INJECT_SRC = `${dictSrc}\n${rulesSrc}\n;\n${transSrc}`;
const HAS_CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[doubao-en]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Launched from Finder (the wrapper app) there is no console — mirror to a log file.
if (!process.stdout.isTTY) {
  const logfile = path.join(process.env.HOME || "/tmp", "Library", "Logs", "doubao-en.log");
  const mirror = (orig) => (...a) => {
    try {
      fs.mkdirSync(path.dirname(logfile), { recursive: true });
      fs.appendFileSync(logfile, new Date().toISOString() + " " + a.join(" ") + "\n");
    } catch {}
    orig(...a);
  };
  console.log = mirror(console.log);
  console.error = mirror(console.error);
}

async function fetchJSON(p, timeoutMs = 1500) {
  const res = await fetch(`${BASE}${p}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function doubaoPids() {
  try {
    return execFileSync("pgrep", ["-x", "Doubao"], { encoding: "utf8" })
      .split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function portAlive() {
  try { await fetchJSON("/json/version"); return true; } catch { return false; }
}

async function ensureDebugApp() {
  if (await portAlive()) { log(`DevTools already listening on :${PORT}`); return; }
  if (NO_LAUNCH) {
    console.error(`DevTools port ${PORT} is not open — start Doubao EN normally, or drop --no-launch.`);
    process.exit(1);
  }
  const pids = doubaoPids();
  if (pids.length) {
    log("Quitting already-running Doubao (it must be restarted with a DevTools port)…");
    for (const pid of pids) process.kill(pid, "SIGTERM");
    for (let i = 0; i < 40 && doubaoPids().length; i++) await sleep(250);
    if (doubaoPids().length) { console.error("Doubao did not quit — close it and try again."); process.exit(1); }
  }
  if (!fs.existsSync(path.join(APP, "Contents", "Info.plist"))) {
    console.error(`Doubao.app not found at ${APP} (set DOUBAO_APP to override).`);
    process.exit(1);
  }
  log("Launching Doubao with DevTools port…");
  await new Promise((res, rej) =>
    execFile("open", ["-a", APP, "--args", `--remote-debugging-port=${PORT}`], (e) => e ? rej(e) : res()));
  for (let i = 0; i < 120 && !(await portAlive()); i++) await sleep(500);
  if (!(await portAlive())) { console.error(`DevTools port ${PORT} never came up.`); process.exit(1); }
  let sawTarget = false;
  for (let i = 0; i < 60 && !sawTarget; i++) {
    try { sawTarget = (await fetchJSON("/json/list")).some((t) => TARGET_URL.test(t.url)); } catch {}
    if (!sawTarget) await sleep(500);
  }
  if (!sawTarget) {
    console.error(`Port ${PORT} is open but no Doubao page targets appeared — is another app using that port?`);
    process.exit(1);
  }
}

const injected = new Map(); // target id -> ws

function attach(target) {
  return new Promise((resolve) => {
    let ws;
    try { ws = new WebSocket(target.webSocketDebuggerUrl); } catch { return resolve(false); }
    const fail = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, 8000);
    ws.onerror = () => { clearTimeout(fail); resolve(false); };
    ws.onclose = () => injected.delete(target.id);
    ws.onopen = async () => {
      clearTimeout(fail);
      let nextId = 1;
      const pending = new Map();
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      };
      const ask = (method, params) => new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({}); } }, 8000);
      });
      injected.set(target.id, { ws, ask });
      // Register for future navigations, then inject into the DOM as it
      // stands. Re-injection is safe: the translator disconnects any
      // previous instance of itself before installing a fresh one.
      await ask("Page.enable", {});
      await ask("Page.addScriptToEvaluateOnNewDocument", { source: INJECT_SRC });
      const r = await ask("Runtime.evaluate", { expression: INJECT_SRC, returnByValue: true });
      if (r && r.exceptionDetails) console.error(`Injection error on ${target.id.slice(0, 8)}:`, r.exceptionDetails.exception?.description ?? "unknown");
      resolve(r && !r.exceptionDetails);
    };
  });
}

async function cdp(attachInfo, method, params) {
  const m = await attachInfo.ask(method, params);
  return m && m.result;
}

function watchLoop(collect) {
  return async () => {
    let targets;
    try { targets = await fetchJSON("/json/list"); } catch {
      if (!doubaoPids().length) { log("Doubao has quit — bye."); process.exit(0); }
      return;
    }
    if (!doubaoPids().length) { log("Doubao has quit — bye."); process.exit(0); }
    for (const t of targets) {
      if (!TARGET_URL.test(t.url)) continue;
      if (!/^page$|^iframe$/.test(t.type)) continue;
      if (injected.has(t.id)) continue;
      if (await attach(t)) log(`Translated target ${t.id.slice(0, 8)} ${t.url.slice(0, 60)}`);
    }
    if (collect) await dumpStrings();
  };
}

const COLLECT_FN = `(() => {
  const dict = window.DOUBAO_EN_DICT || {};
  const norm = (s) => s.replace(/\\s+/g, " ").trim();
  const cjk = /[\\u3400-\\u4dbf\\u4e00-\\u9fff]/;
  const out = new Map();
  const add = (s) => {
    const k = norm(s || "");
    if (!k || !cjk.test(k) || dict[k]) return;
    out.set(k, (out.get(k) || 0) + 1);
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) add(n.nodeValue);
  for (const el of document.querySelectorAll("[placeholder],[data-placeholder],[aria-label],[title],[alt]"))
    for (const a of ["placeholder", "data-placeholder", "aria-label", "title", "alt"]) add(el.getAttribute(a));
  return JSON.stringify([...out.entries()]);
})()`;

async function dumpStrings() {
  const found = new Map();
  for (const [, info] of injected) {
    const r = await cdp(info, "Runtime.evaluate", { expression: COLLECT_FN, returnByValue: true });
    const val = r && r.result && r.result.value;
    if (!val) continue;
    try { for (const [s, c] of JSON.parse(val)) found.set(s, Math.max(found.get(s) || 0, c)); } catch {}
  }
  if (!found.size) return;
  const file = path.join(process.cwd(), "doubao-en-strings.txt");
  const lines = [...found.entries()].sort().map(([s, c]) => `${String(c).padStart(4)}  ${s}`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

async function main() {
  if (typeof WebSocket !== "function") {
    console.error("This launcher needs Node.js 22+ (built-in WebSocket). Install: brew install node");
    process.exit(1);
  }
  await ensureDebugApp();
  const tick = watchLoop(COLLECT);
  await tick();
  if (!injected.size) { console.error("No Doubao page targets found to translate."); process.exit(1); }
  log(`English UI active (${injected.size} target${injected.size > 1 ? "s" : ""}).`);
  if (SHOT) {
    let targets;
    try { targets = await fetchJSON("/json/list"); } catch {}
    const usable = (targets ?? []).filter((x) => injected.has(x.id));
    const t = usable.find((x) => /doubao-chat\/chat/.test(x.url))
      ?? usable.find((x) => /doubao-launcher/.test(x.url))
      ?? usable.find((x) => /^doubao:/.test(x.url))
      ?? usable[0];
    if (t) {
      const r = await cdp(injected.get(t.id), "Page.captureScreenshot", { format: "png" });
      if (r && r.data) { fs.writeFileSync(SHOT, Buffer.from(r.data, "base64")); log(`Screenshot saved: ${SHOT}`); }
      else console.error("Screenshot failed.");
    } else console.error("No attachable target for screenshot.");
    process.exit(0);
  }
  if (ONCE) { process.exit(0); }
  log("Watching for new windows… (Ctrl-C to stop translating; Doubao keeps running)");
  setInterval(() => tick().catch(() => {}), 2000);
}

main().catch((e) => { console.error(e); process.exit(1); });

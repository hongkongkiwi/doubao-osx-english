#!/usr/bin/env node
/*
 * Extracts every Chinese string literal from every script the running Doubao
 * app has loaded, across all targets and frames, and writes the unique set to
 * extracted-strings.txt (one string per line). Diff against lib/dictionary.js
 * to find coverage gaps. Requires Doubao EN (or --remote-debugging-port) running.
 *
 * Usage: node scripts/extract-strings.js [outfile]
 */
"use strict";
const fs = require("node:fs");
const PORT = process.env.DOUBAO_EN_PORT || 9223;

(async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const interesting = targets.filter(t => ["page", "iframe", "webview", "other"].includes(t.type) && /doubao|duola|volc/i.test(t.url));
  console.log(`targets: ${interesting.length}`);
  const universe = new Map(); // string -> Set of urls

  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;
  const literalsOf = (src) => {
    const out = [];
    // string literals: "..." '...' `...` with basic escape support
    const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(src)) && out.length < 200000) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (raw === undefined) continue;
      let s;
      try { s = JSON.parse('"' + raw.replace(/\n/g, "\\n").replace(/"/g, '\\"') + '"'); } catch { s = raw; }
      if (CJK.test(s)) out.push(s);
    }
    return out;
  };

  for (const t of interesting) {
    await new Promise(async (res) => {
      let ws;
      try { ws = new WebSocket(t.webSocketDebuggerUrl); } catch { return res(); }
      const kill = setTimeout(() => { try { ws.close(); } catch {} res(); }, 300000);
      ws.onopen = async () => {
        let id = 1; const pending = new Map(); const scripts = new Map();
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
          if (m.method === "Debugger.scriptParsed") scripts.set(m.params.scriptId, { url: m.params.url, length: m.params.endOffset || 0 });
        };
        const ask = (method, params, ms = 30000) => new Promise(res2 => { const i = id++; pending.set(i, res2); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res2(null); } }, ms); });
        await ask("Debugger.enable", { maxScriptsCacheSize: 1e9 });
        await sleep(2500); // let scriptParsed events drain
        console.log(`[${t.url.slice(8, 50)}] scripts: ${scripts.size}`);
        let done = 0;
        for (const [scriptId, info] of scripts) {
          done++;
          if (done % 100 === 0) console.log(`  ${done}/${scripts.size}`);
          const r = await ask("Debugger.getScriptSource", { scriptId }, 60000);
          const src = r?.result?.scriptSource;
          if (!src) continue;
          for (const s of literalsOf(src)) {
            const key = s.trim();
            if (!key || key.length > 120) continue;
            if (!universe.has(key)) universe.set(key, new Set());
            universe.get(key).add(t.url.replace(/^doubao:\/\//, "").slice(0, 30));
          }
        }
        clearTimeout(kill);
        try { ws.close(); } catch {}
        res();
      };
      ws.onerror = () => { clearTimeout(kill); res(); };
    });
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  const file = process.argv[2] || "extracted-strings.txt";
  const lines = [...universe.keys()].sort();
  fs.writeFileSync(file, lines.join("\n") + "\n");
  console.log(`unique CJK strings: ${lines.length} -> ${file}`);
  process.exit(0);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });

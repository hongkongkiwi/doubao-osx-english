/*
 * Doubao EN — in-page translator.
 * Injected by bin/doubao-en.js. Rewrites visible text whose full (whitespace-
 * collapsed) value matches a dictionary key, then keeps it English:
 *   - a sweep re-walks the DOM every few seconds, catching panels, dialogs
 *     and re-renders (new UI flips to English within one sweep interval);
 *   - translated elements get a setAttribute shim, so framework re-renders
 *     that restore a Chinese attribute (the composer placeholder is one)
 *     land as English directly, with no translate/revert churn.
 * Deliberately NO MutationObserver: combined with Doubao's own framework
 * observers it livelocks the renderer (verified by bisect — observer off is
 * stable, observer on spins a renderer at 100% CPU). The sweep covers the
 * same ground at 3-second granularity.
 * Never touches text inside contenteditable fields, so chat text and prompts
 * are safe. Re-injecting this script replaces the previous instance cleanly.
 */
(function () {
  if (window.__doubaoEn) { try { window.__doubaoEn.destroy(); } catch {} }

  // Read through the global on every lookup, so refreshing the dictionary
  // (re-running the injected source) takes effect without a page reload.
  const dict = () => window.DOUBAO_EN_DICT || {};
  // Interpolated-string rules (built by the launcher from dictionary entries
  // containing placeholders). First matching rule wins.
  const RULES = (window.DOUBAO_EN_RULES || []).map(([src, rep]) => {
    try { return [new RegExp(src), rep]; } catch { return null; }
  }).filter(Boolean);
  const ruleFor = (text) => {
    for (const [rx, rep] of RULES) {
      if (rx.test(text)) return text.replace(rx, rep);
    }
    return null;
  };
  const ATTRS = ["placeholder", "data-placeholder", "aria-label", "title", "alt"];
  const SKIP = "script,style,noscript,textarea,input,code,pre,[contenteditable='true'],[contenteditable='']";

  const norm = (s) => s.replace(/\s+/g, " ").trim();

  function inEditable(node) {
    let p = node.parentElement;
    while (p) {
      if (p.matches && p.matches(SKIP)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function translateTextNode(node) {
    const raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    const en = dict()[norm(raw)] || ruleFor(norm(raw));
    if (!en) return;
    const lead = raw.slice(0, raw.length - raw.trimStart().length);
    const trail = raw.slice(raw.trimEnd().length);
    node.nodeValue = lead + en + trail;
  }

  // React-controlled attributes (the composer placeholder is one) get
  // restored to their Chinese prop on every re-render — and react-dom can
  // call setAttribute through cached prototype references, so the intercept
  // must live on Element.prototype where no caller can bypass it. Only
  // exact dictionary matches on translateable attributes are rewritten;
  // every other write passes through untouched.
  if (!Element.prototype.__doubaoEnPatched) {
    const protoSet = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (typeof value === "string" && ATTRS.includes(name)) {
        const en = dict()[norm(value)];
        if (en) value = en;
      }
      return protoSet.call(this, name, value);
    };
    Element.prototype.__doubaoEnPatched = true;
  }

  function translateAttributes(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v) continue;
      const en = dict()[norm(v)];
      if (en) Element.prototype.setAttribute.call(el, a, en);
    }
  }

  function translateElementText(el) {
    if (inEditable(el)) return; // never rewrite text inside editable fields
    if (el.childElementCount === 0) {
      const t = norm(el.textContent);
      const en = dict()[t] || ruleFor(t);
      if (en) el.textContent = en;
    }
  }

  function sweep() {
    const root = document.body || document.documentElement;
    if (!root || root.nodeType !== 1) return;
    translateAttributes(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) { return inEditable(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
    });
    let n;
    while ((n = w.nextNode())) translateTextNode(n);
    for (const el of root.querySelectorAll("*")) {
      translateElementText(el);
      translateAttributes(el);
    }
  }

  // Placeholder pseudos may render a literal instead of attr(data-placeholder);
  // force the attribute source so the translated attribute is what shows.
  // Scoped to :empty so real content never doubles.
  const style = document.createElement("style");
  style.id = "doubao-en-style";
  style.textContent = "[data-placeholder]:empty::before { content: attr(data-placeholder) !important; }";
  (document.head || document.documentElement).appendChild(style);

  sweep();
  const sweepId = setInterval(sweep, 3000);

  // Newly opened surfaces (menus, dialogs, popovers) must not flash Chinese
  // for up to one full-sweep interval. A fast, targeted pass over overlay
  // elements every 250 ms covers them — overlays are small, so this is cheap.
  // (Polling, not a MutationObserver: see the livelock note above.)
  const OVERLAY_SEL = "[role='menu'],[role='menuitem'],[role='dialog'],[role='alertdialog'],[role='tooltip'],[role='listbox'],[role='option'],[role='combobox'],[data-state='open']";
  function sweepOverlays() {
    for (const el of document.querySelectorAll(OVERLAY_SEL)) {
      translateAttributes(el);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(n) { return inEditable(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
      });
      let n;
      while ((n = w.nextNode())) translateTextNode(n);
      for (const c of el.querySelectorAll("*")) {
        translateElementText(c);
        translateAttributes(c);
      }
    }
  }
  const overlayId = setInterval(sweepOverlays, 250);

  window.__doubaoEn = {
    destroy() {
      clearInterval(sweepId);
      clearInterval(overlayId);
      const s = document.getElementById("doubao-en-style");
      if (s) s.remove();
    },
  };
})();

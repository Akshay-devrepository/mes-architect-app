// ══════════════════════════════════════════
// ACTIONS.JS — replaces inline onclick/onkeydown handlers so the CSP can
// forbid inline script entirely.
//
// Markup says data-onclick="toggleDD(this)" instead of onclick="…". One
// document-level listener reads that string, checks it against a tiny
// grammar (name(args); name(args)…) and an allowlist of function names,
// and calls the function — never eval. Anything that doesn't parse, or
// names a function not on the list, does nothing.
//
// The encrypted modules and translations still contain onclick="…" (their
// ciphertext is untouched); neutralizeInlineHandlers() rewrites those to
// data-on* just before they're inserted, and a MutationObserver catches
// any insertion point that doesn't call it.
// ══════════════════════════════════════════
(function () {
  const ALLOWED = new Set([
    'toggleAnswer', 'toggleDD', 'toggleAcc', 'tryUnlockGate', 'tryGlobalUnlock',
    'showSection', 'goHome', 'goBack', 'prevSection', 'nextSection',
    'toggleSidebar', 'closeSidebar',
    'openSearchPanel', 'closeSearchPanel', 'openSettingsPanel', 'closeSettingsPanel',
    'openFeedbackModal', 'closeFeedbackModal', 'sendFeedback',
    'closeExitConfirm', 'confirmExitApp',
    'decreaseTextSize', 'increaseTextSize', 'resetTextSize',
    'askAiAboutCurrentSection', 'toggleAiChatSize', 'sendMessage', 'sendQuick'
  ]);
  const EVENTS = ['click', 'keydown'];
  const CALL = /^([A-Za-z_$][\w$]*)\s*\(\s*(.*?)\s*\)$/;
  const KEY_GUARD = /^if\s*\(\s*event\.key\s*===\s*'([A-Za-z]+)'\s*\)\s*(.+)$/;

  // Arguments: this | integer | 'single-quoted string' | nothing.
  function parseArgs(src, el) {
    if (src === '') return [];
    if (src === 'this') return [el];
    if (/^-?\d+$/.test(src)) return [parseInt(src, 10)];
    const str = /^'((?:[^'\\]|\\.)*)'$/.exec(src);
    if (str) return [str[1].replace(/\\(.)/g, '$1')];
    return null;
  }

  // Split on ; outside single-quoted strings.
  function statements(code) {
    const out = [];
    let cur = '', quoted = false;
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (c === '\\' && quoted) { cur += c + (code[++i] || ''); continue; }
      if (c === "'") quoted = !quoted;
      if (c === ';' && !quoted) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  function run(code, el, event) {
    for (let stmt of statements(code)) {
      stmt = stmt.trim();
      if (!stmt) continue;
      const guard = KEY_GUARD.exec(stmt);
      if (guard) {
        if (event.key !== guard[1]) continue;
        stmt = guard[2].trim();
      }
      const call = CALL.exec(stmt);
      const args = call && parseArgs(call[2], el);
      const fn = call && ALLOWED.has(call[1]) ? window[call[1]] : null;
      if (typeof fn !== 'function' || !args) {
        console.warn('[actions] refused handler:', code);
        return;
      }
      fn.apply(el, args);
    }
  }

  // Walk from the target outward like real inline handlers bubble, so a
  // handler that calls event.stopPropagation() still stops outer ones.
  function dispatch(event) {
    const attr = 'data-on' + event.type;
    let el = event.target instanceof Element ? event.target : event.target.parentElement;
    while (el && el !== document.documentElement) {
      const code = el.getAttribute(attr);
      if (code) {
        run(code, el, event);
        if (event.cancelBubble) break;
      }
      el = el.parentElement;
    }
  }
  EVENTS.forEach((type) => document.addEventListener(type, dispatch));

  const INLINE_ATTR = /(\s)on(click|keydown)(\s*=)/gi;
  window.neutralizeInlineHandlers = function (html) {
    return typeof html === 'string' ? html.replace(INLINE_ATTR, '$1data-on$2$3') : html;
  };

  function convertTree(root) {
    if (!(root instanceof Element)) return;
    const nodes = root.matches('[onclick],[onkeydown]') ? [root] : [];
    root.querySelectorAll('[onclick],[onkeydown]').forEach((n) => nodes.push(n));
    nodes.forEach((n) => {
      EVENTS.forEach((type) => {
        const v = n.getAttribute('on' + type);
        if (v !== null) { n.setAttribute('data-on' + type, v); n.removeAttribute('on' + type); }
      });
    });
  }
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach(convertTree));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

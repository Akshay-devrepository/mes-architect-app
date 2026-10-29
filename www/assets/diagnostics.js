// ══════════════════════════════════════════
// DIAGNOSTICS.JS — remembers the last few uncaught errors on this device so
// a bug report can say what actually broke. Loaded first so it sees errors
// from every later script.
//
// Nothing leaves the device on its own: the only consumer is the feedback
// form (enhance.js sendFeedback), which appends the recent entries to the
// email the user reviews and sends themselves. Entries hold the message,
// the script file name and line — no page content, keys or account data.
// ══════════════════════════════════════════
(function () {
  const KEY = 'mes_diagnostics_v1';
  const MAX = 20;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function scrub(text) {
    // License keys look like MES-M02-xxxx / long base64 runs; emails are PII.
    return String(text || '')
      .replace(/MES-[A-Z0-9]+-[\w-]+/g, '[key]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '[redacted]')
      .slice(0, 300);
  }
  function fileOf(url) {
    if (!url) return '';
    try { return new URL(url, location.href).pathname.split('/').pop(); } catch (e) { return ''; }
  }
  function record(entry) {
    try {
      const list = load();
      const last = list[list.length - 1];
      // Collapse an error repeating in a loop into one entry with a count.
      if (last && last.msg === entry.msg && last.src === entry.src) { last.n = (last.n || 1) + 1; last.ts = entry.ts; }
      else list.push(entry);
      localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch (e) {}
  }

  window.addEventListener('error', (e) => {
    // Resource load failures (img/script 404s) arrive here without a message.
    if (!e.message) return;
    record({ ts: Date.now(), kind: 'error', msg: scrub(e.message), src: fileOf(e.filename) + (e.lineno ? ':' + e.lineno : '') });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    record({ ts: Date.now(), kind: 'promise', msg: scrub(r && (r.message || r)), src: '' });
  });

  window.MESDiagnostics = {
    recent(n) { return load().slice(-(n || MAX)); },
    // Short plain-text block for a bug report; '' when nothing was recorded.
    summary(n) {
      return this.recent(n || 5).map((d) =>
        new Date(d.ts).toISOString().slice(0, 19).replace('T', ' ') + ' ' + d.kind + ': ' + d.msg +
        (d.src ? ' @ ' + d.src : '') + (d.n > 1 ? ' (×' + d.n + ')' : '')
      ).join('\n');
    },
    clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
})();

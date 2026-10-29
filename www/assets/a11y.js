// ══════════════════════════════════════════
// A11Y.JS — keyboard and screen-reader support layered on the existing
// markup, so the content (including encrypted modules that are revealed
// later) doesn't need hand-editing.
//
// - Anything clickable through data-onclick that isn't natively focusable
//   (nav items, cards, accordion headers…) becomes role="button" +
//   tabindex="0", and Enter/Space activate it.
// - The overlay panels (search, settings, feedback, exit confirm) are real
//   dialogs: labelled, focus moves in on open, Tab stays inside, Escape
//   closes the top one, and focus returns to whatever opened it.
// - The active sidebar item carries aria-current="page"; the menu button
//   reports aria-expanded.
// ══════════════════════════════════════════
(function () {
  const NATIVE = 'a[href],button,input,select,textarea,summary,[contenteditable="true"]';
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
    'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  // ── Clickable non-buttons ──
  function enhanceClickable(el) {
    if (el.matches(NATIVE) || el.hasAttribute('role')) return;
    // Backdrops are mouse/touch conveniences; Escape covers keyboard users.
    if (/Backdrop$/.test(el.id)) { el.setAttribute('aria-hidden', 'true'); return; }
    el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  }
  // Status lines that change after an action (unlock result, translate
  // progress) are announced instead of silently updating.
  const LIVE = { '.locked-error': 'alert', '.feedback-error': 'alert', '#globalLicenseStatus': 'status', '#searchCoverage': 'status' };
  function enhanceTree(root) {
    if (!(root instanceof Element)) return;
    if (root.hasAttribute('data-onclick')) enhanceClickable(root);
    root.querySelectorAll('[data-onclick]').forEach(enhanceClickable);
    Object.entries(LIVE).forEach(([sel, role]) => {
      if (root.matches(sel) && !root.hasAttribute('role')) root.setAttribute('role', role);
      root.querySelectorAll(sel).forEach((n) => { if (!n.hasAttribute('role')) n.setAttribute('role', role); });
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    // Only the focused pseudo-button itself — never a keystroke typed into
    // a field nested inside one.
    if (!(el instanceof Element) || el.getAttribute('role') !== 'button' || el.matches(NATIVE)) return;
    e.preventDefault(); // Space would otherwise scroll the page
    el.click();
  });

  // ── Dialogs ──
  // body class that marks it open → panel element.
  const DIALOGS = [
    { cls: 'exit-confirm-open', id: 'exitConfirmDialog', close: 'closeExitConfirm' },
    { cls: 'feedback-open', id: 'feedbackPanel', close: 'closeFeedbackModal' },
    { cls: 'settings-open', id: 'settingsPanel', close: 'closeSettingsPanel' },
    { cls: 'search-open', id: 'searchPanel', close: 'closeSearchPanel' }
  ];
  const openers = new Map();

  function labelDialog(d) {
    const panel = document.getElementById(d.id);
    if (!panel) return;
    panel.setAttribute('role', d.id === 'exitConfirmDialog' ? 'alertdialog' : 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
      const heading = panel.querySelector('h1,h2,h3,[class*="title"],[class*="header"]');
      const text = heading ? heading.textContent.replace(/✕/g, '').trim() : '';
      panel.setAttribute('aria-label', text || d.id.replace(/(Panel|Dialog)$/, ''));
    }
  }

  function openDialogs() {
    return DIALOGS.filter((d) => document.body.classList.contains(d.cls));
  }

  function syncDialogs(prevClasses) {
    DIALOGS.forEach((d) => {
      const wasOpen = prevClasses.includes(d.cls);
      const isOpen = document.body.classList.contains(d.cls);
      const panel = document.getElementById(d.id);
      if (!panel || wasOpen === isOpen) return;
      if (isOpen) {
        openers.set(d.id, document.activeElement);
        // The open function may already have focused a field (search, feedback).
        if (!panel.contains(document.activeElement)) {
          const first = panel.querySelector(FOCUSABLE);
          if (first) first.focus();
        }
      } else {
        const opener = openers.get(d.id);
        openers.delete(d.id);
        const focusLost = panel.contains(document.activeElement) || document.activeElement === document.body;
        if (opener && document.contains(opener) && focusLost) opener.focus();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    const top = openDialogs()[0];
    if (!top) return;
    if (e.key === 'Escape') {
      if (typeof window[top.close] === 'function') window[top.close]();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById(top.id);
    const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ── State attributes ──
  function syncNavState() {
    document.querySelectorAll('#sidebar .nav-item').forEach((n) => {
      if (n.classList.contains('active')) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current');
    });
    const menuBtn = document.getElementById('menuToggleBtn');
    if (menuBtn) {
      const mobile = window.innerWidth <= 900;
      const toggled = document.body.classList.contains('sidebar-toggled');
      // Mobile: toggled = open. Desktop: open by default, toggled = collapsed.
      menuBtn.setAttribute('aria-expanded', String(mobile ? toggled : !toggled));
      menuBtn.setAttribute('aria-controls', 'sidebar');
    }
  }

  function init() {
    enhanceTree(document.body);
    DIALOGS.forEach(labelDialog);
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.setAttribute('aria-label', 'Modules');
    syncNavState();

    let prevBodyClasses = Array.from(document.body.classList);
    new MutationObserver(() => {
      syncDialogs(prevBodyClasses);
      prevBodyClasses = Array.from(document.body.classList);
      syncNavState();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    if (sidebar) {
      new MutationObserver(syncNavState).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    new MutationObserver((records) => {
      records.forEach((r) => r.addedNodes.forEach(enhanceTree));
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', syncNavState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

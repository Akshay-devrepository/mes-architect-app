// ══════════════════════════════════════════
// DIAGRAM-VIEWER.JS — "⤢ Full view" for wide ASCII diagrams.
//
// On a phone a 70–135-column diagram can't fit at a readable size, so
// inline it scrolls sideways (responsive.css). This adds a button above
// every wide diagram that opens it on the whole screen, where it can be:
//   · read at full size, scrolling in both directions (default), or
//   · fitted to the screen width ("Fit"), or zoomed with A− / A+.
// Zoom changes the font size rather than scaling an image, so the text
// stays sharp and every column stays aligned at any size.
//
// Diagrams arrive late (paid modules are revealed after unlock, and
// translations swap blocks), so a MutationObserver adds buttons as they
// appear. translate.js ignores .diagram-expand when it lists and hashes
// blocks, so the button never disturbs pre-translated content.
// ══════════════════════════════════════════
(function () {
  const WIDE_COLUMNS = 44;     // narrower diagrams fit a phone already
  const MIN_FONT = 6;
  const MAX_FONT = 22;
  const DEFAULT_FONT = 13;
  let overlay = null;
  let current = { font: DEFAULT_FONT, fit: false, columns: 80, source: null };
  let lastFocus = null;

  function columnsOf(diagram) {
    const lines = (diagram.textContent || '').split('\n');
    let max = 0;
    for (const line of lines) max = Math.max(max, [...line.replace(/\s+$/, '')].length);
    return max;
  }

  function titleFor(diagram) {
    // The nearest heading or card title above the diagram names it.
    const card = diagram.closest('.dd-wrap');
    const label = diagram.closest('.dd-section') && diagram.closest('.dd-section').querySelector('.dd-section-label');
    if (label && label.textContent.trim()) return label.textContent.trim();
    for (let el = diagram.previousElementSibling; el; el = el.previousElementSibling) {
      if (/^H[2-4]$/.test(el.tagName) || el.classList.contains('dd-section-label')) return el.textContent.trim();
    }
    const t = card && card.querySelector('.dd-title');
    return (t && t.textContent.trim()) || 'Diagram';
  }

  function addButtons(root) {
    (root.querySelectorAll ? root.querySelectorAll('.diagram') : []).forEach((diagram) => {
      if (diagram.closest('.dv-overlay')) return;
      const prev = diagram.previousElementSibling;
      if (prev && prev.classList.contains('diagram-expand')) return;
      if (columnsOf(diagram) <= WIDE_COLUMNS) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'diagram-expand';
      btn.setAttribute('aria-label', 'Open this diagram in full view');
      btn.innerHTML = '<span aria-hidden="true">⤢</span> Full view';
      btn.hidden = true; // shown by the observer below once it overflows
      diagram.parentNode.insertBefore(btn, diagram);
      if (sizeWatcher) sizeWatcher.observe(diagram); else btn.hidden = false;
    });
  }

  // Only offer Full view where the diagram doesn't fit its box: on a laptop
  // most fit, on a phone most don't. Re-checked whenever the box changes
  // size (deep dive opened, phone rotated, sidebar toggled).
  const sizeWatcher = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      const diagram = entry.target;
      const btn = diagram.previousElementSibling;
      if (!btn || !btn.classList.contains('diagram-expand')) { sizeWatcher.unobserve(diagram); continue; }
      if (!diagram.isConnected) { sizeWatcher.unobserve(diagram); continue; }
      if (diagram.clientWidth > 0) btn.hidden = diagram.scrollWidth <= diagram.clientWidth + 2;
    }
  }) : null;

  // Fallback for when the observer is late or missing (old WebViews,
  // background tabs): re-measure shortly after any tap and on rotation.
  function recheckButtons() {
    document.querySelectorAll('.diagram-expand').forEach((btn) => {
      const diagram = btn.nextElementSibling;
      if (diagram && diagram.clientWidth > 0) btn.hidden = diagram.scrollWidth <= diagram.clientWidth + 2;
    });
  }
  let recheckTimer = 0;
  function scheduleRecheck() { clearTimeout(recheckTimer); recheckTimer = setTimeout(recheckButtons, 400); }

  function stageWidth() {
    const stage = overlay.querySelector('.dv-stage');
    const cs = getComputedStyle(stage);
    return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  // Width of one character at 1px, measured in the real font.
  let charRatio = 0;
  function measureRatio(diagram) {
    const probe = document.createElement('span');
    probe.textContent = '─'.repeat(100);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px;';
    diagram.appendChild(probe);
    const ratio = probe.getBoundingClientRect().width / 100 / 100;
    probe.remove();
    return ratio || 0.6;
  }

  function apply() {
    const diagram = overlay.querySelector('.dv-stage .diagram');
    const pad = 28; // the diagram's own left + right padding
    let font = current.font;
    if (current.fit) {
      font = Math.floor(((stageWidth() - pad) / (current.columns * charRatio)) * 10) / 10;
      font = Math.max(MIN_FONT, Math.min(MAX_FONT, font));
    }
    diagram.style.fontSize = font + 'px';
    diagram.style.padding = '14px';
    overlay.querySelector('[data-dv="fit"]').setAttribute('aria-pressed', String(current.fit));
    overlay.querySelector('.dv-size').textContent = Math.round(font) + 'px';
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'dv-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Diagram full view');
    overlay.innerHTML =
      '<div class="dv-bar">' +
        '<div class="dv-title"></div>' +
        '<button type="button" class="dv-btn" data-dv="out" aria-label="Smaller text">A−</button>' +
        '<button type="button" class="dv-btn" data-dv="fit" aria-pressed="false" aria-label="Fit to screen width">Fit</button>' +
        '<button type="button" class="dv-btn" data-dv="in" aria-label="Larger text">A+</button>' +
        '<button type="button" class="dv-btn" data-dv="close" aria-label="Close full view">✕</button>' +
      '</div>' +
      '<div class="dv-stage"></div>' +
      '<div class="dv-hint"><span class="dv-size"></span> · scroll in any direction · turn your phone sideways for more room</div>';
    overlay.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dv]');
      if (!b) return;
      const action = b.getAttribute('data-dv');
      if (action === 'close') { closeDiagramView(); return; }
      if (action === 'fit') { current.fit = !current.fit; }
      else {
        const base = current.fit ? parseFloat(overlay.querySelector('.dv-stage .diagram').style.fontSize) : current.font;
        current.fit = false;
        current.font = Math.max(MIN_FONT, Math.min(MAX_FONT, base + (action === 'in' ? 1 : -1)));
      }
      apply();
    });
    document.body.appendChild(overlay);
  }

  function openDiagramView(source) {
    if (!overlay) build();
    lastFocus = document.activeElement;
    const clone = source.cloneNode(true);
    clone.removeAttribute('style');
    overlay.querySelector('.dv-stage').replaceChildren(clone);
    overlay.querySelector('.dv-title').textContent = titleFor(source);
    overlay.style.display = '';
    document.body.classList.add('diagram-view-open');
    charRatio = measureRatio(clone);
    current = { font: DEFAULT_FONT, fit: false, columns: columnsOf(source), source };
    // Start fitted when that's still comfortably readable; otherwise full
    // size, and the reader scrolls.
    current.fit = true;
    apply();
    if (parseFloat(clone.style.fontSize) < 10) { current.fit = false; apply(); }
    overlay.querySelector('[data-dv="close"]').focus();
  }

  function closeDiagramView() {
    if (!overlay || overlay.style.display === 'none') return;
    overlay.style.display = 'none';
    overlay.querySelector('.dv-stage').replaceChildren();
    document.body.classList.remove('diagram-view-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.closeDiagramView = closeDiagramView;

  document.addEventListener('click', (e) => {
    scheduleRecheck();
    const btn = e.target.closest && e.target.closest('.diagram-expand');
    if (!btn) return;
    const diagram = btn.nextElementSibling;
    if (diagram && diagram.classList.contains('diagram')) openDiagramView(diagram);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('diagram-view-open')) closeDiagramView();
  });
  window.addEventListener('resize', () => {
    scheduleRecheck();
    if (overlay && document.body.classList.contains('diagram-view-open') && current.fit) apply();
  });

  document.addEventListener('DOMContentLoaded', () => {
    addButtons(document);
    let queued = false;
    new MutationObserver((records) => {
      if (queued) return;
      if (!records.some((r) => r.addedNodes.length)) return;
      queued = true;
      setTimeout(() => { queued = false; addButtons(document); scheduleRecheck(); }, 60);
    }).observe(document.body, { childList: true, subtree: true });
  });
})();

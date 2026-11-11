// ══════════════════════════════════════════
// MINDMAP.JS — renders an interactive, pan/zoomable mind map for any
// module from window.MINDMAP_DATA (mindmap-data.js), in a full-screen
// modal. Self-contained: builds its own modal DOM and per-module trigger
// buttons on load, following the same pattern translate.js uses for its
// per-section controls (addTranslateControlsToModules).
//
// Mind maps are shown even for locked modules — they're a structural
// preview (topic names only, no real body content), same spirit as the
// existing locked-module "what's inside" teaser. No unlock/lock-state
// wiring needed as a result: the button is always active.
// ══════════════════════════════════════════

const MM_COL_WIDTH = 260;
const MM_ROW_HEIGHT = 54;
const MM_ROOT_WIDTH = 240;
const MM_NODE_WIDTH = 190;
const MM_NODE_HEIGHT_MIN = 40;
const MM_LINE_HEIGHT = 16;
const MM_PADDING = 60;

// Depth-based color tokens (cycles if a tree ever goes deeper than this).
const MM_DEPTH_COLORS = ['#f59e0b', '#22d3ee', '#a78bfa', '#10b981'];

let mmMeasureCanvas = null;
function mmMeasureText(text, font) {
  if (!mmMeasureCanvas) mmMeasureCanvas = document.createElement('canvas');
  const ctx = mmMeasureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

// Greedy word-wrap to fit maxWidth, capped at 3 lines (overflow gets an
// ellipsis on the last line) — keeps every node a predictable, boundable
// size so the layout math below can treat node height as near-fixed.
function mmWrapText(text, maxWidth, font) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (mmMeasureText(test, font) <= maxWidth || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
    if (lines.length === 3) break;
  }
  if (lines.length < 3 && cur) lines.push(cur);
  if (lines.length === 3) {
    // Confirm the 3rd line + remaining words actually needed truncation.
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[2];
      while (mmMeasureText(last + '…', maxWidth) > maxWidth && last.length > 1) {
        last = last.slice(0, -1).trim();
      }
      lines[2] = last + '…';
    }
  }
  return lines;
}

// Normalizes a raw data node (string leaf or {title, children}) into a
// full layout node: {title, children, depth, lines, w, h, x, y (center)}.
function mmBuildLayoutTree(raw, depth) {
  const title = typeof raw === 'string' ? raw : raw.title;
  const rawChildren = typeof raw === 'string' ? [] : (raw.children || []);
  const w = depth === 0 ? MM_ROOT_WIDTH : MM_NODE_WIDTH;
  const font = (depth === 0 ? '600 14px' : '500 12px') + ' var(--sans, sans-serif)';
  const innerW = w - 24; // horizontal padding inside the box
  const lines = mmWrapText(title, innerW, font.replace('var(--sans, sans-serif)', 'Sora, sans-serif'));
  const h = Math.max(MM_NODE_HEIGHT_MIN, lines.length * MM_LINE_HEIGHT + 20);
  const node = {
    title, depth, w, h, lines,
    children: rawChildren.map((c) => mmBuildLayoutTree(c, depth + 1)),
    x: depth * MM_COL_WIDTH,
    y: 0,
  };
  return node;
}

// Bottom-up pass: assigns each leaf a row, each parent the average of its
// children's centers. Returns the next free row index.
function mmAssignRows(node, rowState) {
  if (node.children.length === 0) {
    node.y = rowState.next * MM_ROW_HEIGHT;
    rowState.next += 1;
    return;
  }
  for (const c of node.children) mmAssignRows(c, rowState);
  const first = node.children[0].y;
  const last = node.children[node.children.length - 1].y;
  node.y = (first + last) / 2;
}

function mmComputeBounds(node, bounds) {
  bounds.minX = Math.min(bounds.minX, node.x);
  bounds.maxX = Math.max(bounds.maxX, node.x + node.w);
  bounds.minY = Math.min(bounds.minY, node.y - node.h / 2);
  bounds.maxY = Math.max(bounds.maxY, node.y + node.h / 2);
  node.children.forEach((c) => mmComputeBounds(c, bounds));
}

function mmSvgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function mmRenderNode(node, svg) {
  const color = MM_DEPTH_COLORS[node.depth % MM_DEPTH_COLORS.length];
  const x = node.x, y = node.y - node.h / 2;

  for (const c of node.children) {
    const path = mmSvgEl('path', {
      d: 'M ' + (node.x + node.w) + ' ' + node.y +
         ' C ' + (node.x + node.w + 40) + ' ' + node.y + ', ' +
                 (c.x - 40) + ' ' + c.y + ', ' +
                 c.x + ' ' + c.y,
      fill: 'none',
      stroke: color,
      'stroke-opacity': '0.45',
      'stroke-width': '2',
    });
    svg.appendChild(path);
  }

  const g = mmSvgEl('g', { class: 'mm-node', 'data-depth': node.depth });
  const rect = mmSvgEl('rect', {
    x, y, width: node.w, height: node.h, rx: node.depth === 0 ? 12 : 8,
    fill: node.depth === 0 ? color : 'var(--surface2)',
    stroke: color, 'stroke-width': node.depth === 0 ? 0 : 1.5,
  });
  g.appendChild(rect);

  const textEl = mmSvgEl('text', {
    x: node.x + node.w / 2, y: node.y,
    'text-anchor': 'middle', 'dominant-baseline': 'central',
    fill: node.depth === 0 ? '#060b14' : 'var(--text)',
    'font-family': 'var(--sans)',
    'font-weight': node.depth === 0 ? '700' : (node.depth === 1 ? '600' : '500'),
    'font-size': node.depth === 0 ? '14' : '12',
  });
  const startDy = -((node.lines.length - 1) * MM_LINE_HEIGHT) / 2;
  node.lines.forEach((line, i) => {
    const tspan = mmSvgEl('tspan', {
      x: node.x + node.w / 2,
      dy: i === 0 ? startDy : MM_LINE_HEIGHT,
    });
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });
  g.appendChild(textEl);
  svg.appendChild(g);

  node.children.forEach((c) => mmRenderNode(c, svg));
}

// ── Pan / zoom state, scoped per open() call ──
let mmView = { scale: 1, tx: 0, ty: 0 };
let mmDrag = null;

function mmApplyTransform() {
  const g = document.getElementById('mmZoomGroup');
  if (g) g.setAttribute('transform', 'translate(' + mmView.tx + ',' + mmView.ty + ') scale(' + mmView.scale + ')');
}

function mmZoomBy(factor, cx, cy) {
  const newScale = Math.max(0.25, Math.min(2.5, mmView.scale * factor));
  const ratio = newScale / mmView.scale;
  // Keep the point under (cx, cy) — viewport coords — visually fixed.
  mmView.tx = cx - (cx - mmView.tx) * ratio;
  mmView.ty = cy - (cy - mmView.ty) * ratio;
  mmView.scale = newScale;
  mmApplyTransform();
}

function mmFitToView() {
  const container = document.getElementById('mmCanvas');
  const svg = document.getElementById('mmSvg');
  if (!container || !svg) return;
  const bw = parseFloat(svg.dataset.boundsW || '1');
  const bh = parseFloat(svg.dataset.boundsH || '1');
  const cw = container.clientWidth, ch = container.clientHeight;
  const scale = Math.max(0.25, Math.min(2.5, Math.min(cw / bw, ch / bh)));
  mmView.scale = scale;
  mmView.tx = (cw - bw * scale) / 2 - parseFloat(svg.dataset.boundsMinX || '0') * scale;
  mmView.ty = (ch - bh * scale) / 2 - parseFloat(svg.dataset.boundsMinY || '0') * scale;
  mmApplyTransform();
}

function mmEnsureModal() {
  if (document.getElementById('mindmapModal')) return;
  const modal = document.createElement('div');
  modal.id = 'mindmapModal';
  modal.className = 'mindmap-modal';
  modal.innerHTML =
    '<div class="mindmap-modal-header">' +
      '<div class="mindmap-modal-title" id="mmTitle"></div>' +
      '<div class="mindmap-modal-actions">' +
        '<button class="mm-ctrl-btn" id="mmZoomOut" title="Zoom out">−</button>' +
        '<button class="mm-ctrl-btn" id="mmZoomReset" title="Fit to screen">⤢</button>' +
        '<button class="mm-ctrl-btn" id="mmZoomIn" title="Zoom in">+</button>' +
        '<button class="mm-ctrl-btn mm-close-btn" id="mmClose" title="Close">✕</button>' +
      '</div>' +
    '</div>' +
    '<div class="mindmap-canvas" id="mmCanvas">' +
      '<svg id="mmSvg"><g id="mmZoomGroup"></g></svg>' +
    '</div>';
  document.body.appendChild(modal);

  document.getElementById('mmClose').addEventListener('click', closeMindmap);
  document.getElementById('mmZoomIn').addEventListener('click', () => {
    const c = document.getElementById('mmCanvas');
    mmZoomBy(1.25, c.clientWidth / 2, c.clientHeight / 2);
  });
  document.getElementById('mmZoomOut').addEventListener('click', () => {
    const c = document.getElementById('mmCanvas');
    mmZoomBy(0.8, c.clientWidth / 2, c.clientHeight / 2);
  });
  document.getElementById('mmZoomReset').addEventListener('click', mmFitToView);

  const canvas = document.getElementById('mmCanvas');
  canvas.addEventListener('pointerdown', (e) => {
    mmDrag = { startX: e.clientX, startY: e.clientY, origTx: mmView.tx, origTy: mmView.ty };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!mmDrag) return;
    mmView.tx = mmDrag.origTx + (e.clientX - mmDrag.startX);
    mmView.ty = mmDrag.origTy + (e.clientY - mmDrag.startY);
    mmApplyTransform();
  });
  const endDrag = () => { mmDrag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mmZoomBy(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
}

function openMindmap(idx) {
  const data = window.MINDMAP_DATA && window.MINDMAP_DATA[idx];
  if (!data) return;
  mmEnsureModal();

  const svg = document.getElementById('mmSvg');
  const zoomGroup = document.getElementById('mmZoomGroup');
  zoomGroup.innerHTML = '';
  document.getElementById('mmTitle').textContent = data.title;

  const root = mmBuildLayoutTree(data, 0);
  mmAssignRows(root, { next: 0 });
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  mmComputeBounds(root, bounds);
  const bw = (bounds.maxX - bounds.minX) + MM_PADDING * 2;
  const bh = (bounds.maxY - bounds.minY) + MM_PADDING * 2;
  svg.dataset.boundsW = bw;
  svg.dataset.boundsH = bh;
  svg.dataset.boundsMinX = bounds.minX - MM_PADDING;
  svg.dataset.boundsMinY = bounds.minY - MM_PADDING;

  mmRenderNode(root, zoomGroup);

  document.getElementById('mindmapModal').classList.add('open');
  document.body.classList.add('mindmap-open');
  // Fit-to-view needs real layout dimensions, which only exist once the
  // modal is actually visible (display:flex) — next frame, not this one.
  requestAnimationFrame(mmFitToView);
}
window.openMindmap = openMindmap;

function closeMindmap() {
  const modal = document.getElementById('mindmapModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('mindmap-open');
}
window.closeMindmap = closeMindmap;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('mindmapModal');
    if (modal && modal.classList.contains('open')) closeMindmap();
  }
});

function addMindmapControlsToModules() {
  if (!window.MINDMAP_DATA) return;
  for (let idx = 0; idx <= 15; idx++) {
    const section = document.getElementById('sec-' + idx);
    if (!section || !window.MINDMAP_DATA[idx]) continue;
    const header = section.querySelector('.section-header');
    if (!header || header.querySelector('.mindmap-open-btn')) continue;

    const btn = document.createElement('button');
    btn.className = 'mindmap-open-btn';
    btn.innerHTML = '🧠 Mindmap';
    btn.title = 'View this module as a mind map';
    btn.addEventListener('click', () => openMindmap(idx));
    header.appendChild(btn);
  }
}
window.addMindmapControlsToModules = addMindmapControlsToModules;
document.addEventListener('DOMContentLoaded', addMindmapControlsToModules);

// ══════════════════════════════════════════
// ENHANCE.JS — bookmarks/star, Saved section, Quiz Mode
// Works purely by scanning the existing DOM (.dd-wrap concept
// cards and .q-box question cards) so it stays in sync with the
// content automatically — no manual indexing needed.
// ══════════════════════════════════════════

const BOOKMARK_KEY = 'mes_bookmarks_v1';
const QUIZ_MASTERED_KEY = 'mes_quiz_mastered_v1';

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveBookmarks(map) {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(map));
}

function sectionIndexOf(el) {
  const sec = el.closest('.section');
  if (!sec) return null;
  const m = /sec-(\d+)/.exec(sec.id);
  return m ? parseInt(m[1], 10) : null;
}

function truncate(str, n) {
  str = (str || '').replace(/\s+/g, ' ').trim();
  return str.length > n ? str.slice(0, n).trim() + '…' : str;
}

function makeStarBtn(id, meta) {
  const btn = document.createElement('div');
  btn.className = 'star-btn';
  btn.dataset.bmId = id;
  btn.innerHTML = '☆';
  btn.title = 'Save for later';
  const bookmarks = loadBookmarks();
  if (bookmarks[id]) { btn.classList.add('starred'); btn.innerHTML = '★'; }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBookmark(id, meta, btn);
  });
  return btn;
}

function toggleBookmark(id, meta, btn) {
  const bookmarks = loadBookmarks();
  if (bookmarks[id]) {
    delete bookmarks[id];
    if (btn) { btn.classList.remove('starred'); btn.innerHTML = '☆'; }
  } else {
    bookmarks[id] = meta;
    if (btn) { btn.classList.add('starred'); btn.innerHTML = '★'; }
  }
  saveBookmarks(bookmarks);
  updateSavedCount();
  if (document.getElementById('sec-17') && document.getElementById('sec-17').classList.contains('active')) {
    renderSaved();
  }
}

function updateSavedCount() {
  const count = Object.keys(loadBookmarks()).length;
  const dot = document.getElementById('savedCountDot');
  if (dot) dot.textContent = count > 0 ? String(count) : '';
}

// ── Inject stars on every concept card and question card ──
function injectStars() {
  document.querySelectorAll('.dd-wrap').forEach((wrap, i) => {
    const header = wrap.querySelector('.dd-header');
    if (!header) return;
    const id = 'dd-' + i;
    const title = wrap.querySelector('.dd-title');
    const label = wrap.querySelector('.dd-label');
    const summary = wrap.querySelector('.dd-summary-text');
    const meta = {
      type: 'concept',
      section: sectionIndexOf(wrap),
      title: title ? title.textContent.trim() : ('Concept ' + i),
      label: label ? label.textContent.trim() : '',
      snippet: truncate(summary ? summary.textContent : '', 140)
    };
    header.appendChild(makeStarBtn(id, meta));
  });

  document.querySelectorAll('.q-box').forEach((box, i) => {
    const id = 'qa-' + i;
    const qText = box.querySelector('.q-text');
    const label = box.querySelector('.q-label');
    const aText = box.querySelector('.a-text');
    const meta = {
      type: 'question',
      section: sectionIndexOf(box),
      title: qText ? qText.textContent.trim() : ('Question ' + i),
      label: label ? label.textContent.trim() : '',
      snippet: truncate(aText ? aText.textContent : '', 140)
    };
    box.appendChild(makeStarBtn(id, meta));
  });

  updateSavedCount();
}

// ── Saved section ──
function renderSaved() {
  const root = document.getElementById('saved-root');
  if (!root) return;
  const bookmarks = loadBookmarks();
  const ids = Object.keys(bookmarks);

  if (ids.length === 0) {
    root.innerHTML = '<div class="saved-empty">Nothing saved yet. Click the ☆ on any concept card or question across the board to bookmark it here.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'saved-grid';
  ids.forEach((id) => {
    const meta = bookmarks[id];
    const card = document.createElement('div');
    card.className = 'saved-card';
    card.innerHTML =
      '<span class="saved-card-remove" data-remove="' + id + '">✕ remove</span>' +
      '<div class="saved-card-type">' + (meta.type === 'concept' ? '◈ concept' : '? question') +
        (meta.section !== null ? ' · module ' + (meta.section + 1) : '') + '</div>' +
      '<div class="saved-card-title">' + escapeHtml(meta.title) + '</div>' +
      '<div class="saved-card-snip">' + escapeHtml(meta.snippet) + '</div>';

    card.addEventListener('click', (e) => {
      if (e.target.dataset.remove) return;
      if (meta.section !== null && typeof showSection === 'function') showSection(meta.section);
      setTimeout(() => {
        const target = document.querySelector('[data-bm-id="' + id + '"]');
        if (target) {
          const container = target.closest('.dd-wrap, .q-box');
          if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            container.style.transition = 'box-shadow 0.3s';
            container.style.boxShadow = '0 0 0 2px var(--amber)';
            setTimeout(() => { container.style.boxShadow = ''; }, 1400);
          }
        }
      }, 80);
    });
    grid.appendChild(card);
  });

  root.innerHTML = '';
  root.appendChild(grid);

  root.querySelectorAll('[data-remove]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.remove;
      const btn = document.querySelector('.star-btn[data-bm-id="' + id + '"]');
      toggleBookmark(id, bookmarks[id], btn);
      renderSaved();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ══════════════════════════════════════════
// QUIZ MODE
// ══════════════════════════════════════════
let quizDeck = null;      // full deck, built once
let quizQueue = [];        // ids remaining this session
let quizIndex = 0;
let quizFlipped = false;
let quizFilter = 'all';    // 'all' | 'unmastered'

function loadMastered() {
  try { return new Set(JSON.parse(localStorage.getItem(QUIZ_MASTERED_KEY)) || []); }
  catch (e) { return new Set(); }
}
function saveMastered(set) {
  localStorage.setItem(QUIZ_MASTERED_KEY, JSON.stringify(Array.from(set)));
}

function buildQuizDeck() {
  if (quizDeck) return quizDeck;
  const deck = [];

  document.querySelectorAll('.q-box').forEach((box, i) => {
    const qText = box.querySelector('.q-text');
    const aText = box.querySelector('.a-text');
    const label = box.querySelector('.q-label');
    if (!qText || !aText) return;
    deck.push({
      id: 'qa-' + i,
      tag: label ? label.textContent.replace(/^\/\/\s*/, '').trim() : 'Concept Board',
      q: qText.textContent.trim(),
      a: aText.textContent.trim()
    });
  });

  (window.QUIZ_DATA_EXTRA || []).forEach((item, i) => {
    deck.push({ id: 'extra-' + i, tag: item.tag, q: item.q, a: item.a });
  });

  quizDeck = deck;
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQuizQueue() {
  const deck = buildQuizDeck();
  const mastered = loadMastered();
  const pool = quizFilter === 'unmastered' ? deck.filter(c => !mastered.has(c.id)) : deck;
  quizQueue = shuffle(pool).map(c => c.id);
  quizIndex = 0;
  quizFlipped = false;
}

function renderQuiz() {
  const root = document.getElementById('quiz-root');
  if (!root) return;
  const deck = buildQuizDeck();

  if (!root.dataset.started) {
    startQuizQueue();
    root.dataset.started = '1';
  }

  const mastered = loadMastered();
  const totalInPool = quizFilter === 'unmastered' ? deck.filter(c => !mastered.has(c.id)).length : deck.length;

  let html = '';
  html += '<div class="quiz-toolbar">';
  html += '<span class="quiz-stat">Deck: <b>' + deck.length + '</b> cards</span>';
  html += '<span class="quiz-stat">Mastered: <b>' + mastered.size + '</b> / ' + deck.length + '</span>';
  html += '<select class="quiz-select" id="quizFilterSelect">' +
            '<option value="all"' + (quizFilter === 'all' ? ' selected' : '') + '>All cards</option>' +
            '<option value="unmastered"' + (quizFilter === 'unmastered' ? ' selected' : '') + '>Not yet mastered</option>' +
          '</select>';
  html += '<button class="btn-sm" id="quizShuffleBtn">🔀 Shuffle / Restart</button>';
  html += '</div>';

  if (quizQueue.length === 0) {
    html += '<div class="quiz-done">' +
      '<div class="quiz-done-title">' + (totalInPool === 0 ? 'Nothing to review 🎉' : 'Deck cleared for this session') + '</div>' +
      '<div class="quiz-done-sub">' + mastered.size + ' of ' + deck.length + ' cards mastered overall.</div>' +
      '<button class="quiz-restart-btn" id="quizRestartBtn">Start Again</button>' +
      '</div>';
    root.innerHTML = html;
    document.getElementById('quizShuffleBtn').addEventListener('click', () => { startQuizQueue(); renderQuiz(); });
    document.getElementById('quizFilterSelect').addEventListener('change', (e) => { quizFilter = e.target.value; startQuizQueue(); renderQuiz(); });
    document.getElementById('quizRestartBtn').addEventListener('click', () => { startQuizQueue(); renderQuiz(); });
    return;
  }

  const progressPct = Math.round(((deck.length - quizQueue.length) / Math.max(deck.length, 1)) * 100);
  const card = deck.find(c => c.id === quizQueue[quizIndex]);

  html += '<div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:' + progressPct + '%"></div></div>';
  html += '<div class="quiz-stage">';
  html += '<div class="flip-card' + (quizFlipped ? ' flipped' : '') + '" id="quizFlipCard">';
  html += '<div class="flip-card-inner">';
  html += '<div class="flip-face front"><div class="flip-face-label">// ' + escapeHtml(card.tag) + ' — Question ' + (quizIndex + 1) + '/' + quizQueue.length + '</div><div class="flip-face-text">' + escapeHtml(card.q) + '</div></div>';
  html += '<div class="flip-face back"><div class="flip-face-label">// Answer</div><div class="flip-face-text">' + escapeHtml(card.a) + '</div></div>';
  html += '</div></div>';
  html += '<div class="flip-hint">' + (quizFlipped ? 'Rate yourself below' : 'Tap the card to reveal the answer') + '</div>';

  if (quizFlipped) {
    html += '<div class="quiz-rate-row">' +
      '<button class="quiz-rate-btn again" id="quizAgainBtn">😕 Still fuzzy — review again</button>' +
      '<button class="quiz-rate-btn good" id="quizGoodBtn">✅ Got it — mark mastered</button>' +
      '</div>';
  }
  html += '</div>';

  root.innerHTML = html;

  document.getElementById('quizShuffleBtn').addEventListener('click', () => { startQuizQueue(); renderQuiz(); });
  document.getElementById('quizFilterSelect').addEventListener('change', (e) => { quizFilter = e.target.value; startQuizQueue(); renderQuiz(); });
  document.getElementById('quizFlipCard').addEventListener('click', () => { quizFlipped = !quizFlipped; renderQuiz(); });

  if (quizFlipped) {
    document.getElementById('quizAgainBtn').addEventListener('click', () => {
      const id = quizQueue.splice(quizIndex, 1)[0];
      quizQueue.push(id);
      const m = loadMastered(); m.delete(id); saveMastered(m);
      if (quizIndex >= quizQueue.length) quizIndex = 0;
      quizFlipped = false;
      renderQuiz();
    });
    document.getElementById('quizGoodBtn').addEventListener('click', () => {
      const id = quizQueue.splice(quizIndex, 1)[0];
      const m = loadMastered(); m.add(id); saveMastered(m);
      if (quizIndex >= quizQueue.length) quizIndex = 0;
      quizFlipped = false;
      renderQuiz();
    });
  }
}

window.renderSaved = renderSaved;
window.renderQuiz = renderQuiz;

// ── Wrap every table so a wide one scrolls inside itself on small
//    screens instead of forcing the whole page to scroll sideways ──
function wrapTables() {
  document.querySelectorAll('.section table').forEach((table) => {
    if (table.closest('.tbl-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tbl-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectStars();
  wrapTables();
});

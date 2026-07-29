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
// Safe to call more than once (e.g. after a locked module is unlocked and
// its cards appear in the DOM for the first time): already-starred elements
// are skipped, and ids are scoped per-section + a within-section counter
// rather than a single global counter, so a module unlocked out of order
// can never end up reusing an id an earlier module's card already has.
function injectStars() {
  const ddCounters = {};
  document.querySelectorAll('.dd-wrap').forEach((wrap) => {
    const header = wrap.querySelector('.dd-header');
    if (!header || header.querySelector('.star-btn')) return;
    const sec = sectionIndexOf(wrap);
    const secKey = sec === null ? 'x' : sec;
    ddCounters[secKey] = (ddCounters[secKey] || 0) + 1;
    const id = 'dd-' + secKey + '-' + ddCounters[secKey];
    const title = wrap.querySelector('.dd-title');
    const label = wrap.querySelector('.dd-label');
    const summary = wrap.querySelector('.dd-summary-text');
    const meta = {
      type: 'concept',
      section: sec,
      title: title ? title.textContent.trim() : ('Concept ' + id),
      label: label ? label.textContent.trim() : '',
      snippet: truncate(summary ? summary.textContent : '', 140)
    };
    header.appendChild(makeStarBtn(id, meta));
  });

  const qaCounters = {};
  document.querySelectorAll('.q-box').forEach((box) => {
    if (box.querySelector('.star-btn')) return;
    const sec = sectionIndexOf(box);
    const secKey = sec === null ? 'x' : sec;
    qaCounters[secKey] = (qaCounters[secKey] || 0) + 1;
    const id = 'qa-' + secKey + '-' + qaCounters[secKey];
    const qText = box.querySelector('.q-text');
    const label = box.querySelector('.q-label');
    const aText = box.querySelector('.a-text');
    const meta = {
      type: 'question',
      section: sec,
      title: qText ? qText.textContent.trim() : ('Question ' + id),
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
// QUIZ MODE — spaced repetition (simplified SM-2, the same idea Anki is
// built on). Each card tracks its own interval/ease/due-date instead of a
// single mastered/not-mastered flag, so cards you know well resurface
// after weeks, cards you miss resurface tomorrow, and "due today" is an
// actual queue rather than "everything not yet mastered."
// ══════════════════════════════════════════
let quizDeck = null;      // full deck, built once
let quizQueue = [];        // ids remaining this session
let quizIndex = 0;
let quizFlipped = false;
let quizFilter = 'due';    // 'due' | 'all'

const QUIZ_SCHEDULE_KEY = 'mes_quiz_schedule_v2';
const SM2_DEFAULT_EASE = 2.5;
const SM2_MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadSchedule() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUIZ_SCHEDULE_KEY));
    if (raw) return raw;
  } catch (e) { /* fall through to migration/empty */ }

  // One-time migration from the old binary mastered/not-mastered set, so
  // upgrading doesn't throw away existing progress: a previously-mastered
  // card starts with a short established interval instead of "new."
  const migrated = {};
  try {
    const old = JSON.parse(localStorage.getItem(QUIZ_MASTERED_KEY));
    if (Array.isArray(old)) {
      old.forEach((id) => {
        migrated[id] = { interval: 6, ease: SM2_DEFAULT_EASE, reps: 2, due: Date.now() };
      });
      localStorage.removeItem(QUIZ_MASTERED_KEY);
    }
  } catch (e) { /* no old data — fresh start */ }
  saveSchedule(migrated);
  return migrated;
}
function saveSchedule(schedule) {
  localStorage.setItem(QUIZ_SCHEDULE_KEY, JSON.stringify(schedule));
}

// quality: 4 = "Got it", 2 = "Still fuzzy" (simplified from SM-2's 0-5 scale
// down to the two ratings the UI actually offers).
function scheduleCard(schedule, id, quality) {
  const card = schedule[id] || { interval: 0, ease: SM2_DEFAULT_EASE, reps: 0, due: 0 };
  if (quality < 3) {
    card.reps = 0;
    card.interval = 1;
  } else {
    card.reps += 1;
    if (card.reps === 1) card.interval = 1;
    else if (card.reps === 2) card.interval = 6;
    else card.interval = Math.round(card.interval * card.ease);
  }
  card.ease = Math.max(SM2_MIN_EASE, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  card.due = Date.now() + card.interval * DAY_MS;
  schedule[id] = card;
  return card;
}

function isDue(schedule, id) {
  const card = schedule[id];
  return !card || card.due <= Date.now();
}

function nextDueInWords(schedule, deck) {
  const future = deck
    .map((c) => schedule[c.id])
    .filter((c) => c && c.due > Date.now())
    .sort((a, b) => a.due - b.due);
  if (!future.length) return null;
  const days = Math.ceil((future[0].due - Date.now()) / DAY_MS);
  return days <= 1 ? 'tomorrow' : 'in ' + days + ' days';
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
      // Recorded alongside the id (not encoded inside it) so the Progress
      // Dashboard can attribute a card to its module without needing to
      // change the id format itself — the id is what spaced-repetition
      // schedule data is keyed by, so changing its shape would silently
      // orphan everyone's existing review history.
      section: sectionIndexOf(box),
      tag: label ? label.textContent.replace(/^\/\/\s*/, '').trim() : 'Concept Board',
      q: qText.textContent.trim(),
      a: aText.textContent.trim()
    });
  });

  (window.QUIZ_DATA_EXTRA || []).forEach((item, i) => {
    deck.push({ id: 'extra-' + i, section: null, tag: item.tag, q: item.q, a: item.a });
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
  const schedule = loadSchedule();
  const pool = quizFilter === 'due' ? deck.filter((c) => isDue(schedule, c.id)) : deck;
  quizQueue = shuffle(pool).map((c) => c.id);
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

  const schedule = loadSchedule();
  const dueCount = deck.filter((c) => isDue(schedule, c.id)).length;
  const learned = deck.filter((c) => schedule[c.id] && schedule[c.id].reps > 0).length;
  const totalInPool = quizFilter === 'due' ? dueCount : deck.length;

  let html = '';
  html += '<div class="quiz-toolbar">';
  html += '<span class="quiz-stat">Deck: <b>' + deck.length + '</b> cards</span>';
  html += '<span class="quiz-stat">Due today: <b>' + dueCount + '</b></span>';
  html += '<span class="quiz-stat">Learned: <b>' + learned + '</b> / ' + deck.length + '</span>';
  html += '<select class="quiz-select" id="quizFilterSelect">' +
            '<option value="due"' + (quizFilter === 'due' ? ' selected' : '') + '>Due for review</option>' +
            '<option value="all"' + (quizFilter === 'all' ? ' selected' : '') + '>All cards</option>' +
          '</select>';
  html += '<button class="btn-sm" id="quizShuffleBtn">🔀 Shuffle / Restart</button>';
  html += '</div>';

  if (quizQueue.length === 0) {
    const nextDue = nextDueInWords(schedule, deck);
    const doneTitle = quizFilter === 'due'
      ? (nextDue ? 'All caught up 🎉' : 'Nothing to review yet')
      : 'Deck cleared for this session';
    const doneSub = quizFilter === 'due' && nextDue
      ? 'Next card due ' + nextDue + '. Switch to "All cards" to review early anyway.'
      : learned + ' of ' + deck.length + ' cards learned so far.';
    html += '<div class="quiz-done">' +
      '<div class="quiz-done-title">' + doneTitle + '</div>' +
      '<div class="quiz-done-sub">' + doneSub + '</div>' +
      '<button class="quiz-restart-btn" id="quizRestartBtn">Start Again</button>' +
      '</div>';
    root.innerHTML = html;
    document.getElementById('quizShuffleBtn').addEventListener('click', () => { startQuizQueue(); renderQuiz(); });
    document.getElementById('quizFilterSelect').addEventListener('change', (e) => { quizFilter = e.target.value; startQuizQueue(); renderQuiz(); });
    document.getElementById('quizRestartBtn').addEventListener('click', () => { startQuizQueue(); renderQuiz(); });
    return;
  }

  const progressPct = Math.round(((totalInPool - quizQueue.length) / Math.max(totalInPool, 1)) * 100);
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
      '<button class="quiz-rate-btn good" id="quizGoodBtn">✅ Got it — see you in a few days</button>' +
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
      quizQueue.push(id); // resurface later in this same session too
      const s = loadSchedule(); scheduleCard(s, id, 2); saveSchedule(s);
      if (quizIndex >= quizQueue.length) quizIndex = 0;
      quizFlipped = false;
      renderQuiz();
    });
    document.getElementById('quizGoodBtn').addEventListener('click', () => {
      const id = quizQueue.splice(quizIndex, 1)[0];
      const s = loadSchedule(); scheduleCard(s, id, 4); saveSchedule(s);
      if (quizIndex >= quizQueue.length) quizIndex = 0;
      quizFlipped = false;
      renderQuiz();
    });
  }
}

window.renderSaved = renderSaved;
window.renderQuiz = renderQuiz;

// ══════════════════════════════════════════
// GLOSSARY — searches window.GLOSSARY_DATA (assets/glossary-data.js)
// ══════════════════════════════════════════
function renderGlossary() {
  const root = document.getElementById('glossary-root');
  if (!root) return;
  const searchInput = document.getElementById('glossarySearch');
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.addEventListener('input', () => renderGlossaryList(searchInput.value));
    searchInput.dataset.wired = '1';
  }
  renderGlossaryList(searchInput ? searchInput.value : '');
}

function renderGlossaryList(query) {
  const root = document.getElementById('glossary-root');
  if (!root) return;
  const terms = (window.GLOSSARY_DATA || []).slice().sort((a, b) => a.term.localeCompare(b.term));
  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? terms.filter((t) =>
        t.term.toLowerCase().includes(q) ||
        (t.expansion && t.expansion.toLowerCase().includes(q)) ||
        t.definition.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q))
    : terms;

  if (filtered.length === 0) {
    root.innerHTML = '<div class="glossary-empty">No terms match "' + escapeHtml(query) + '".</div>';
    return;
  }

  root.innerHTML =
    '<div class="glossary-count">' + filtered.length + ' of ' + terms.length + ' terms</div>' +
    '<div class="glossary-grid">' +
    filtered.map((t) =>
      '<div class="glossary-card">' +
        '<div class="glossary-card-top">' +
          '<span class="glossary-term">' + escapeHtml(t.term) + '</span>' +
          '<span class="glossary-category">' + escapeHtml(t.category) + '</span>' +
        '</div>' +
        (t.expansion ? '<div class="glossary-expansion">' + escapeHtml(t.expansion) + '</div>' : '') +
        '<div class="glossary-definition">' + escapeHtml(t.definition) + '</div>' +
      '</div>'
    ).join('') +
    '</div>';
}

window.renderGlossary = renderGlossary;

// ══════════════════════════════════════════
// PROGRESS DASHBOARD — reads data every other feature already collects
// (visited sections, the quiz schedule, bookmarks) rather than tracking
// anything new, plus a per-module quiz breakdown using each card's SM-2
// ease factor as a rough "how solid is this module" signal.
// ══════════════════════════════════════════
function computeProgressStats() {
  const schedule = loadSchedule();
  const deck = buildQuizDeck();
  const contentModulesVisited = Array.from(visitedSections).filter((i) => i < 16).length;
  const learned = deck.filter((c) => schedule[c.id] && schedule[c.id].reps > 0).length;
  const due = deck.filter((c) => isDue(schedule, c.id)).length;
  const bookmarkCount = Object.keys(loadBookmarks()).length;

  const perModule = {};
  let extraTotal = 0, extraAttempted = 0;
  deck.forEach((card) => {
    const sched = schedule[card.id];
    if (card.section !== null && card.section !== undefined) {
      const modIdx = card.section;
      if (!perModule[modIdx]) perModule[modIdx] = { total: 0, attempted: 0, easeSum: 0 };
      perModule[modIdx].total++;
      if (sched) { perModule[modIdx].attempted++; perModule[modIdx].easeSum += sched.ease; }
    } else {
      extraTotal++;
      if (sched) extraAttempted++;
    }
  });

  return { contentModulesVisited, learned, due, bookmarkCount, deckSize: deck.length, perModule, extraTotal, extraAttempted };
}

function homeStatsHtml(stats) {
  return '<div class="home-stat"><div class="home-stat-value">' + stats.contentModulesVisited + '/16</div><div class="home-stat-label">Modules visited</div></div>' +
    '<div class="home-stat"><div class="home-stat-value">' + stats.learned + '/' + stats.deckSize + '</div><div class="home-stat-label">Quiz cards learned</div></div>' +
    '<div class="home-stat"><div class="home-stat-value">' + stats.due + '</div><div class="home-stat-label">Due today</div></div>' +
    '<div class="home-stat"><div class="home-stat-value">' + stats.bookmarkCount + '</div><div class="home-stat-label">Bookmarks</div></div>';
}

function renderHomeStats() {
  const el = document.getElementById('homeStats');
  if (!el) return;
  const stats = computeProgressStats();
  el.innerHTML = '<div class="home-stats-row">' + homeStatsHtml(stats) +
    '</div><a class="home-stat-link" onclick="showSection(19)">View full progress →</a>';
}
window.renderHomeStats = renderHomeStats;

function renderProgress() {
  const root = document.getElementById('progress-root');
  if (!root) return;
  const stats = computeProgressStats();

  let moduleRows = '';
  for (let i = 0; i < 16; i++) {
    const isLocked = !!document.querySelector('#sec-' + i + ' .locked-gate:not(.unlocked)');
    const visited = visitedSections.has(i);
    const modStats = stats.perModule[i];
    let statusLabel, statusClass;
    if (isLocked) { statusLabel = '🔒 Locked'; statusClass = 'locked'; }
    else if (modStats && modStats.attempted > 0) {
      // Require a meaningful sample before asserting Strong/Needs review —
      // otherwise 1 lucky (or unlucky) card out of dozens would swing a
      // verdict that's supposed to mean something.
      const coverage = modStats.attempted / modStats.total;
      const avgEase = modStats.easeSum / modStats.attempted;
      if (coverage < 0.3) { statusLabel = 'In progress'; statusClass = 'visited'; }
      else if (avgEase < 2.2) { statusLabel = 'Needs review'; statusClass = 'needs-review'; }
      else { statusLabel = 'Strong'; statusClass = 'strong'; }
    } else if (visited) { statusLabel = 'Visited, no quiz yet'; statusClass = 'visited'; }
    else { statusLabel = 'Not started'; statusClass = 'not-started'; }

    moduleRows +=
      '<div class="progress-row">' +
        '<div class="progress-row-title">' + escapeHtml(sectionTitles[i]) + '</div>' +
        '<div class="progress-row-quiz">' + (modStats ? modStats.attempted + '/' + modStats.total + ' cards' : '—') + '</div>' +
        '<div class="progress-row-status ' + statusClass + '">' + statusLabel + '</div>' +
      '</div>';
  }

  root.innerHTML =
    '<div class="home-stats-row">' + homeStatsHtml(stats) + '</div>' +
    '<div class="progress-section-title">Per-module quiz performance</div>' +
    '<div class="progress-table">' +
      '<div class="progress-row progress-row-head"><div>Module</div><div>Quiz cards</div><div>Status</div></div>' +
      moduleRows +
    '</div>' +
    (stats.extraTotal > 0
      ? '<div class="progress-extra-note">Plus ' + stats.extraAttempted + '/' + stats.extraTotal + ' hand-written drill cards (calculations, acronyms) not tied to a specific module.</div>'
      : '');
}
window.renderProgress = renderProgress;

// ══════════════════════════════════════════
// GLOBAL SEARCH — searches whatever concept cards and questions are
// currently in the DOM (so it naturally only covers the free module plus
// whatever's been unlocked) and the Glossary, from one overlay reachable
// anywhere via the topbar icon or Ctrl/Cmd+K.
// ══════════════════════════════════════════
const TOTAL_CONTENT_MODULES = 16;
let searchResultsCache = [];
let searchDebounceTimer = null;

function openSearchPanel() {
  document.body.classList.add('search-open');
  updateSearchCoverage();
  const input = document.getElementById('searchInput');
  if (!input.dataset.wired) {
    input.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => runSearch(input.value), 150);
    });
    input.dataset.wired = '1';
  }
  input.focus();
  runSearch(input.value);
}
window.openSearchPanel = openSearchPanel;

function closeSearchPanel() {
  document.body.classList.remove('search-open');
}
window.closeSearchPanel = closeSearchPanel;

function updateSearchCoverage() {
  const lockedCount = document.querySelectorAll('.locked-gate:not(.unlocked)').length;
  const unlockedModules = TOTAL_CONTENT_MODULES - lockedCount;
  const el = document.getElementById('searchCoverage');
  if (!el) return;
  el.textContent = lockedCount > 0
    ? 'Searching ' + unlockedModules + ' of ' + TOTAL_CONTENT_MODULES + ' modules — unlock the rest to search their content too.'
    : 'Searching all ' + TOTAL_CONTENT_MODULES + ' modules.';
}

function runSearch(query) {
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    resultsEl.innerHTML = '<div class="search-hint">Type to search concept cards, questions, and glossary terms. (Ctrl/Cmd+K opens this from anywhere.)</div>';
    return;
  }

  const results = [];

  document.querySelectorAll('.section .dd-wrap').forEach((wrap) => {
    const titleEl = wrap.querySelector('.dd-title');
    const summaryEl = wrap.querySelector('.dd-summary-text');
    const titleText = titleEl ? titleEl.textContent.trim() : '';
    const summaryText = summaryEl ? summaryEl.textContent.trim() : '';
    if ((titleText + ' ' + summaryText).toLowerCase().includes(q)) {
      results.push({ type: 'concept', title: titleText, snippet: truncate(summaryText, 140), section: sectionIndexOf(wrap), target: wrap });
    }
  });

  document.querySelectorAll('.section .q-box').forEach((box) => {
    const qEl = box.querySelector('.q-text');
    const aEl = box.querySelector('.a-text');
    const qStr = qEl ? qEl.textContent.trim() : '';
    const aStr = aEl ? aEl.textContent.trim() : '';
    if ((qStr + ' ' + aStr).toLowerCase().includes(q)) {
      results.push({ type: 'question', title: qStr, snippet: truncate(aStr, 140), section: sectionIndexOf(box), target: box });
    }
  });

  (window.GLOSSARY_DATA || []).forEach((t) => {
    const hay = (t.term + ' ' + (t.expansion || '') + ' ' + t.definition + ' ' + t.category).toLowerCase();
    if (hay.includes(q)) {
      results.push({ type: 'glossary', title: t.term, snippet: truncate(t.definition, 140), glossaryTerm: t.term });
    }
  });

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-hint">No matches for "' + escapeHtml(query) + '".</div>';
    return;
  }

  searchResultsCache = results;
  const shown = results.slice(0, 50);
  resultsEl.innerHTML =
    '<div class="search-count">' + results.length + ' result' + (results.length === 1 ? '' : 's') +
      (results.length > 50 ? ' (showing first 50)' : '') + '</div>' +
    shown.map((r, i) => {
      const tag = r.type === 'glossary' ? 'Glossary' : (r.section !== null ? 'Module ' + (r.section + 1) : '');
      return '<div class="search-result" data-idx="' + i + '">' +
        '<div class="search-result-tag">' + escapeHtml(tag) + '</div>' +
        '<div class="search-result-title">' + escapeHtml(r.title) + '</div>' +
        '<div class="search-result-snippet">' + escapeHtml(r.snippet) + '</div>' +
      '</div>';
    }).join('');

  resultsEl.querySelectorAll('.search-result').forEach((el) => {
    el.addEventListener('click', () => {
      const r = searchResultsCache[parseInt(el.dataset.idx, 10)];
      closeSearchPanel();
      if (r.type === 'glossary') {
        showSection(18);
        setTimeout(() => {
          const gInput = document.getElementById('glossarySearch');
          if (gInput) { gInput.value = r.glossaryTerm; gInput.dispatchEvent(new Event('input')); }
        }, 100);
        return;
      }
      showSection(r.section);
      setTimeout(() => {
        if (r.target && document.body.contains(r.target)) {
          r.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          r.target.style.transition = 'box-shadow 0.3s';
          r.target.style.boxShadow = '0 0 0 2px var(--amber)';
          setTimeout(() => { r.target.style.boxShadow = ''; }, 1400);
        }
      }, 80);
    });
  });
}

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
  // Home is the active view on first load, and its stats strip is built by
  // this file — but this file loads after the INIT block that first shows
  // Home, so that first render needs to happen here instead.
  renderHomeStats();
});

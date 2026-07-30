// ══════════════════════════════════════════
// TRANSLATE.JS — on-demand module content translation via the same free
// Groq API the AI Coach already uses. There's no backend and the paid
// modules are encrypted at rest, so pre-translating content isn't
// realistic; this translates whatever's currently unlocked and in the
// DOM, one concept/Q&A card at a time, entirely client-side.
//
// Only touches .section-header (always plaintext, shown even for locked
// modules) to inject the controls — never modifies encrypt-modules.js or
// requires re-encrypting anything.
// ══════════════════════════════════════════

const TRANSLATE_LANGUAGES = [
  'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Hindi', 'Mandarin Chinese', 'Japanese', 'Korean', 'Arabic'
];

// sectionIdx -> Map(cardElement -> original innerHTML), so "Show Original"
// can restore exactly what was there before translating.
const translateOriginals = {};

function addTranslateControlsToModules() {
  for (let idx = 0; idx <= 15; idx++) {
    const section = document.getElementById('sec-' + idx);
    if (!section) continue;
    const header = section.querySelector('.section-header');
    if (!header || header.querySelector('.translate-controls')) continue;

    const box = document.createElement('div');
    box.className = 'translate-controls';
    box.innerHTML =
      '<select class="quiz-select translate-lang-select">' +
        TRANSLATE_LANGUAGES.map((lang) => '<option value="' + lang + '">' + lang + '</option>').join('') +
      '</select>' +
      '<button class="translate-btn">🌐 Translate</button>' +
      '<button class="translate-revert-btn" style="display:none">↺ Show Original</button>' +
      '<span class="translate-status"></span>';
    header.appendChild(box);

    box.querySelector('.translate-btn').addEventListener('click', () => translateModule(idx));
    box.querySelector('.translate-revert-btn').addEventListener('click', () => revertModuleTranslation(idx));
  }
}
window.addTranslateControlsToModules = addTranslateControlsToModules;

async function translateModule(idx) {
  const section = document.getElementById('sec-' + idx);
  const statusEl = section.querySelector('.translate-status');
  const translateBtn = section.querySelector('.translate-btn');
  const revertBtn = section.querySelector('.translate-revert-btn');

  const stillLocked = section.querySelector('.locked-gate:not(.unlocked)');
  if (stillLocked) {
    statusEl.textContent = 'Unlock this module first, then translate it.';
    return;
  }
  if (!GROQ_API_KEY || !GROQ_API_KEY.startsWith('gsk_')) {
    statusEl.textContent = 'Translation needs the AI engine, which isn’t configured yet.';
    return;
  }

  const cards = Array.from(section.querySelectorAll('.dd-wrap, .q-box'));
  if (!cards.length) {
    statusEl.textContent = 'Nothing to translate in this module yet.';
    return;
  }

  const language = section.querySelector('.translate-lang-select').value;
  if (!translateOriginals[idx]) translateOriginals[idx] = new Map();
  const originals = translateOriginals[idx];

  translateBtn.disabled = true;
  let translatedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!originals.has(card)) originals.set(card, card.innerHTML);

    // Groq's free tier caps at 12,000 tokens/minute for this model, and a
    // single large card can use 7,000-11,000 by itself — translating
    // several cards back to back routinely trips a 429. Rather than treat
    // that as a hard failure, back off for exactly as long as Groq says to
    // and retry the same card once.
    let attempt = 0;
    let succeeded = false;
    while (attempt < 2 && !succeeded) {
      attempt++;
      statusEl.textContent = 'Translating card ' + (i + 1) + ' of ' + cards.length + ' to ' + language + '…';
      try {
        const translatedHtml = await translateCardHtml(originals.get(card), language);
        card.innerHTML = translatedHtml;
        succeeded = true;
        translatedCount++;
      } catch (e) {
        if (e.retryAfterMs && attempt < 2) {
          const waitSec = Math.ceil(e.retryAfterMs / 1000);
          statusEl.textContent = 'Rate limited by the free AI tier — waiting ' + waitSec + 's before retrying card ' + (i + 1) + '…';
          await sleep(e.retryAfterMs);
        } else {
          failedCount++;
          break;
        }
      }
    }
  }

  statusEl.textContent = failedCount
    ? 'Translated ' + translatedCount + ' of ' + cards.length + ' cards (' + failedCount + ' kept in English — try again if needed).'
    : 'Translated all ' + translatedCount + ' cards to ' + language + '.';
  translateBtn.disabled = false;
  revertBtn.style.display = '';
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function revertModuleTranslation(idx) {
  const originals = translateOriginals[idx];
  if (!originals) return;
  originals.forEach((html, card) => { card.innerHTML = html; });

  const section = document.getElementById('sec-' + idx);
  section.querySelector('.translate-revert-btn').style.display = 'none';
  section.querySelector('.translate-status').textContent = '';
}

async function translateCardHtml(html, language) {
  const systemPrompt =
    'You translate small HTML fragments from a Manufacturing Execution System (MES) ' +
    'interview-prep app into ' + language + '. Rules, followed exactly:\n' +
    '1. Translate ONLY the human-readable prose text into ' + language + '.\n' +
    '2. Never change HTML tag names, attribute names, attribute values, class names, ' +
    'onclick handlers, or inline style attributes.\n' +
    '3. Never translate short technical/classification badges that look like standards, ' +
    'codes, or metrics (e.g. "ISA-95 Level 3", "OEE", "21 CFR Part 11") — keep those exactly as-is.\n' +
    '4. Preserve the exact HTML structure and tag nesting — do not add, remove, or reorder tags.\n' +
    '5. Return ONLY the resulting HTML fragment. No markdown code fences, no explanation, no commentary.';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: html }],
      temperature: 0.2,
      // Some concept cards run well past 10K characters of nested HTML —
      // max_tokens is just a ceiling (not a cost/quota reservation), so
      // sizing it generously here avoids truncating a large card mid-
      // translation, which would fail the structural check below anyway.
      max_tokens: 8000
    })
  });

  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    const message = (body && body.error && body.error.message) || '';
    const match = /try again in ([\d.]+)s/i.exec(message);
    // Cap the wait — if Groq ever asks for an unreasonably long pause,
    // treat it as a failure for this card rather than block the whole
    // module on one multi-minute wait.
    const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 15000;
    const err = new Error('rate-limited');
    if (waitMs <= 70000) err.retryAfterMs = waitMs;
    throw err;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await res.json();
  const translated = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!translated) throw new Error('empty-response');

  // The model sometimes ignores rule #5 and adds a one-line preamble in
  // the target language before the HTML (or wraps it in a code fence) —
  // slicing from the first "<" to the last ">" discards any of that
  // surrounding prose/fencing regardless of where it lands.
  const start = translated.indexOf('<');
  const end = translated.lastIndexOf('>');
  const cleaned = (start !== -1 && end !== -1 && end > start)
    ? translated.slice(start, end + 1).trim()
    : translated.trim();

  // Structural sanity check — reject anything that looks like it dropped
  // or hallucinated tags rather than risk corrupting the page with a
  // malformed response. A little slack for minor tag-count drift from
  // translated attribute quoting/whitespace differences.
  const origTagCount = (html.match(/<[a-zA-Z][^>]*>/g) || []).length;
  const newTagCount = (cleaned.match(/<[a-zA-Z][^>]*>/g) || []).length;
  if (origTagCount > 0 && Math.abs(origTagCount - newTagCount) > Math.max(2, Math.round(origTagCount * 0.2))) {
    throw new Error('structure-mismatch');
  }

  return cleaned;
}

document.addEventListener('DOMContentLoaded', addTranslateControlsToModules);

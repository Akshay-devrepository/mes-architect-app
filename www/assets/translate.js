// ══════════════════════════════════════════
// TRANSLATE.JS — module content translation, static-first with a live-API
// fallback. There's no backend and the paid modules are encrypted at rest,
// so most content is translated card-by-card on demand via the same free
// Groq API the AI Coach uses.
//
// A growing subset of modules are pre-translated offline instead (see
// scripts/generate-translations.js and assets/translations/*.js) — each
// card's translation is encrypted the same way the English original is
// (both individual-key and bundle-key variants), so unlock gating still
// applies per-language exactly like it does for English. For those
// modules, translateModule() below decrypts and swaps instantly with zero
// API calls, zero rate-limit exposure. Anything not yet pre-translated —
// or where the card's English content has since changed (content-hash
// mismatch) — falls through to the live per-card API call unchanged.
//
// Deliberately uses a different Groq model (GROQ_TRANSLATE_MODEL, see
// index.html) than the AI Coach's chat model for the live-API path —
// Groq's free tier quotas are tracked per model, so translation doesn't
// compete with AI Coach chat traffic for the same tokens/minute budget.
//
// Only touches .section-header (always plaintext, shown even for locked
// modules) to inject the controls — never modifies encrypt-modules.js or
// requires re-encrypting anything.
// ══════════════════════════════════════════

const TRANSLATE_LANGUAGES = [
  'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Hindi', 'Mandarin Chinese', 'Japanese', 'Korean', 'Arabic'
];

// Maps a browser/device locale's primary subtag (the "es" in "es-ES") to
// one of the languages already offered above, so the dropdown starts on
// whatever the device is already set to instead of always defaulting to
// Spanish. Falls back to leaving the default selection alone (English
// devices, or a locale not in the list above, e.g. English itself has no
// entry since there's nothing to translate to).
const DEVICE_LANGUAGE_MAP = {
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
  hi: 'Hindi', zh: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic'
};

function detectDeviceTranslateDefault() {
  const locale = (navigator.language || navigator.userLanguage || '').toLowerCase();
  const primary = locale.split('-')[0];
  const matched = DEVICE_LANGUAGE_MAP[primary];
  return TRANSLATE_LANGUAGES.includes(matched) ? matched : null;
}

// sectionIdx -> Map(cardElement -> original innerHTML), so "Show Original"
// can restore exactly what was there before translating.
const translateOriginals = {};

// Only languages scripts/generate-translations.js has actually produced
// static content for — anything else always uses the live API path below.
const PRETRANSLATED_LANGUAGE_CODES = {
  Spanish: 'es', French: 'fr', German: 'de',
  'Mandarin Chinese': 'zh', Arabic: 'ar', Japanese: 'ja'
};

// Mirrors scripts/generate-translations.js's textContentApprox()+contentHash()
// exactly (tag-strip, common-entity-decode, whitespace-collapse, then
// SHA-256 → base64 → first 16 chars) — element.textContent already gives
// the tag-stripped, entity-decoded text natively, so only the whitespace
// normalization needs doing here before hashing.
async function contentHashBrowser(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).slice(0, 16);
}

// Tries to serve this card's translation from pre-generated static content
// (see assets/translations/*.js) instead of a live API call — instant,
// and immune to Groq's free-tier rate limits entirely, since it's just a
// local decrypt. Returns the translated HTML on a hit, or null if this
// module/language/card combination isn't covered yet (caller falls back
// to the live path), or the card's English text has changed since the
// translation was generated — the hash guards against ever showing a
// stale translation of content that's since been edited.
async function tryPretranslatedCard(idx, cardPosition, cardEl, language) {
  const langCode = PRETRANSLATED_LANGUAGE_CODES[language];
  if (!langCode) return null;
  const table = window['PRETRANSLATED_' + langCode.toUpperCase()];
  const entries = table && table[idx];
  const entry = entries && entries[cardPosition];
  if (!entry) return null;

  // enhance.js's injectStars() appends a .star-btn bookmark toggle inside
  // every card after unlock — real DOM content, but never part of the
  // stored encrypted plaintext scripts/generate-translations.js hashed.
  // Comparing against it directly would make every card look "changed"
  // permanently. Hash a clone with those runtime-injected buttons removed
  // instead, so the check reflects only the actual authored content.
  const clone = cardEl.cloneNode(true);
  clone.querySelectorAll('.star-btn').forEach((el) => el.remove());
  const currentText = clone.textContent.replace(/\s+/g, ' ').trim();
  const currentHash = await contentHashBrowser(currentText);
  if (currentHash !== entry.hash) return null;

  const unlock = window.getUnlockKeyForModule && window.getUnlockKeyForModule(idx);
  if (!unlock) return null; // no cached raw key on this device — live path will still work

  // Try both variants regardless of which key type is cached, exactly like
  // attemptUnlockModule() does for the English content — cheap, and robust
  // to either key having been the one that actually unlocked this device.
  let plaintext = await tryDecrypt(entry.individual, unlock.key);
  if (!plaintext) plaintext = await tryDecrypt(entry.bundle, unlock.key + '::sec-' + idx);
  return plaintext || null;
}

function addTranslateControlsToModules() {
  const deviceDefault = detectDeviceTranslateDefault();

  for (let idx = 0; idx <= 15; idx++) {
    const section = document.getElementById('sec-' + idx);
    if (!section) continue;
    const header = section.querySelector('.section-header');
    if (!header || header.querySelector('.translate-controls')) continue;

    const box = document.createElement('div');
    box.className = 'translate-controls';
    box.innerHTML =
      '<select class="quiz-select translate-lang-select">' +
        '<option value=""' + (deviceDefault ? '' : ' selected') + '>🌐 Choose a language…</option>' +
        TRANSLATE_LANGUAGES.map((lang) =>
          '<option value="' + lang + '"' + (lang === deviceDefault ? ' selected' : '') + '>' + lang + '</option>'
        ).join('') +
      '</select>' +
      '<button class="translate-btn">🌐 Translate</button>' +
      '<button class="translate-revert-btn" style="display:none">↺ Show Original</button>' +
      '<span class="translate-status"></span>';
    header.appendChild(box);

    box.querySelector('.translate-btn').addEventListener('click', () => translateModule(idx));
    box.querySelector('.translate-revert-btn').addEventListener('click', () => revertModuleTranslation(idx));
    refreshTranslateLockUI(idx);
  }
}
window.addTranslateControlsToModules = addTranslateControlsToModules;

// Keeps the translate controls looking (and behaving) consistent with every
// other locked-module control on the page — dimmed/disabled until unlock,
// instead of looking fully live and only failing after a click into
// translateModule()'s own stillLocked check. Exposed so license.js's
// revealModule() can call it again the moment a module unlocks mid-session,
// since addTranslateControlsToModules() only ever builds each section's box
// once (on page load).
function refreshTranslateLockUI(idx) {
  const section = document.getElementById('sec-' + idx);
  const box = section && section.querySelector('.translate-controls');
  if (!box) return;
  const locked = !!section.querySelector('.locked-gate:not(.unlocked)');
  const btn = box.querySelector('.translate-btn');
  box.querySelector('.translate-lang-select').disabled = locked;
  btn.disabled = locked;
  btn.title = locked ? 'Unlock this module first, then translate it.' : '';
  box.querySelector('.translate-status').textContent = locked ? '🔒 Unlock to translate' : '';
}
window.refreshTranslateLockUI = refreshTranslateLockUI;

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

  const cards = Array.from(section.querySelectorAll('.dd-wrap, .q-box'));
  if (!cards.length) {
    statusEl.textContent = 'Nothing to translate in this module yet.';
    return;
  }

  const language = section.querySelector('.translate-lang-select').value;
  if (!language) {
    statusEl.textContent = 'Pick a language first.';
    return;
  }
  if (!translateOriginals[idx]) translateOriginals[idx] = new Map();
  const originals = translateOriginals[idx];

  translateBtn.disabled = true;
  let translatedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!originals.has(card)) originals.set(card, card.innerHTML);

    statusEl.textContent = 'Translating card ' + (i + 1) + ' of ' + cards.length + ' to ' + language + '…';
    const pretranslated = await tryPretranslatedCard(idx, i, card, language).catch(() => null);
    if (pretranslated) {
      card.innerHTML = pretranslated;
      translatedCount++;
      continue;
    }

    if (!GROQ_API_KEY || !GROQ_API_KEY.startsWith('gsk_')) {
      // No pretranslated hit above, and the live-API engine isn't
      // configured (only happens running locally without CI's secret
      // substitution) — nothing more can be done for this card.
      failedCount++;
      continue;
    }

    // Groq's free tier caps this model at 8,000 tokens/minute, and this
    // is a reasoning model whose internal "thinking" adds real overhead on
    // top of the translation itself — translating several cards back to
    // back can still trip a 429 (too many requests already sent) or a 413
    // (this request alone needs more than what's left in the window).
    // Rather than treat either as a hard failure, back off for exactly as
    // long as Groq says to and retry the same card once.
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

// Groq's x-ratelimit-reset-tokens header uses a compound duration string
// like "24.697s", "5m45.6s", or "1ms" rather than a plain number — this
// pulls out however many of the h/m/s/ms parts are present.
function parseGroqDurationMs(str) {
  if (!str) return null;
  if (/^[\d.]+ms$/.test(str)) return parseFloat(str);
  let ms = 0;
  const h = /([\d.]+)h/.exec(str);
  const m = /([\d.]+)m(?!s)/.exec(str);
  const s = /([\d.]+)s/.exec(str);
  if (h) ms += parseFloat(h[1]) * 3600000;
  if (m) ms += parseFloat(m[1]) * 60000;
  if (s) ms += parseFloat(s[1]) * 1000;
  return ms || null;
}

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
      model: GROQ_TRANSLATE_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: html }],
      temperature: 0.2,
      // GROQ_TRANSLATE_MODEL is a reasoning model — Groq's free-tier TPM
      // cap (8,000) is checked against prompt tokens + this ceiling
      // combined, so requesting the full 8,000 here would claim the
      // entire per-minute budget on every single call. Sized instead to
      // comfortably cover a real card's translation + reasoning overhead
      // (observed ~1,400-2,500 tokens total in testing) while leaving
      // headroom for several cards to succeed within the same window.
      max_tokens: 4000
    })
  });

  // Groq returns 429 when too many requests have already gone out, and
  // 413 when THIS request's token need (prompt + max_tokens) alone would
  // exceed the remaining per-minute budget — both are the same underlying
  // "free-tier ceiling" situation from the caller's perspective, so both
  // get the same retry-once-after-backoff treatment.
  if (res.status === 429 || res.status === 413) {
    const body = await res.json().catch(() => null);
    const message = (body && body.error && body.error.message) || '';
    const match = /try again in ([\d.]+)s/i.exec(message);
    const waitMs = match
      ? Math.ceil(parseFloat(match[1]) * 1000) + 500
      : (parseGroqDurationMs(res.headers.get('x-ratelimit-reset-tokens')) || 15000) + 500;
    // Cap the wait — if Groq ever asks for an unreasonably long pause,
    // treat it as a failure for this card rather than block the whole
    // module on one multi-minute wait.
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

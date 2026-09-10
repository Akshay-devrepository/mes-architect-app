// ══════════════════════════════════════════
// TRANSLATE.JS — module content translation, fully pre-translated offline.
// There's no backend and the paid modules are encrypted at rest, so every
// module/language pair is generated ahead of time (see
// scripts/generate-translations.js and assets/translations/*.js) — each
// card's translation is encrypted the same way the English original is
// (both individual-key and bundle-key variants), so unlock gating still
// applies per-language exactly like it does for English. translateModule()
// below decrypts and swaps instantly with zero API calls.
//
// There used to be a live Groq API fallback for anything not pre-translated
// (and it's what the AI Coach still uses for chat), but coverage is now
// comprehensive and that path was unreliable — rate limits, and truncated
// responses that left big deep-dive cards in English — so it was removed.
// The dropdown only offers a language once every block is covered AND a
// decryption key is cached; a block whose English text changed after its
// translation was generated (hash mismatch) simply stays in English and is
// reported, rather than being sent to a flaky API.
//
// Only touches .section-header (always plaintext, shown even for locked
// modules) to inject the controls — never modifies encrypt-modules.js or
// requires re-encrypting anything.
// ══════════════════════════════════════════

// The curated "best 6" — kept in sync with PRETRANSLATED_LANGUAGE_CODES
// below, since a language with no pretranslated coverage can never
// actually appear in the (real, post-unlock-rebuilt) dropdown anyway.
const TRANSLATE_LANGUAGES = [
  'Mandarin Chinese', 'Japanese', 'German', 'Korean', 'Italian', 'French'
];

// Maps a browser/device locale's primary subtag (the "de" in "de-DE") to
// one of the languages already offered above, so the dropdown starts on
// whatever the device is already set to instead of always defaulting to
// the placeholder. Falls back to leaving the default selection alone
// (English devices, or a locale not in the list above).
const DEVICE_LANGUAGE_MAP = {
  fr: 'French', de: 'German', it: 'Italian',
  zh: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean'
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
// static content for — anything else is simply never offered.
const PRETRANSLATED_LANGUAGE_CODES = {
  'Mandarin Chinese': 'zh', Japanese: 'ja', German: 'de',
  Korean: 'ko', Italian: 'it', French: 'fr'
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

// Every direct child of a module's content container is one translatable
// unit — concept cards, but also headings, intro paragraphs, diagrams,
// tables, and accordions that sit alongside them. Locked modules keep
// their content as ciphertext on .locked-gate until unlock, so this only
// finds real blocks post-unlock; the free module (index 0) has no
// .locked-gate/.unlocked-content wrapper at all, so it falls back to the
// section itself, with the always-visible .section-header excluded (that
// header is shown pre-purchase for paid modules too and is handled, if
// ever, as a separate concern from body content).
function getTranslatableBlocks(section) {
  const container = section.querySelector('.unlocked-content') || section;
  return Array.from(container.children).filter((el) => !el.classList.contains('section-header'));
}

// enhance.js's injectStars() appends a .star-btn bookmark toggle inside
// every card after unlock — real DOM content, but never part of the
// stored encrypted plaintext scripts/generate-translations.js hashed.
// Comparing against it directly would make every block look "changed"
// permanently, so hash a clone with those runtime-injected buttons
// removed instead — the check then reflects only the actual authored
// content, matching what generation hashed.
async function hashBlockElement(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.star-btn').forEach((btn) => btn.remove());
  const text = clone.textContent.replace(/\s+/g, ' ').trim();
  return contentHashBrowser(text);
}

// The full per-language ciphertext files (assets/translations/<lang>.js —
// up to ~4.5 MB each) are NOT loaded on page start any more; only the
// ~10 KB hashes-only manifest is. This fetches a language's real content
// the first time it's actually needed, then caches the promise so repeat
// calls (and the module's block loop) share the one download. The service
// worker's network-first fetch handler caches the file itself for offline
// use after that.
const pretranslatedLangLoads = {};
function ensurePretranslatedLang(langCode) {
  const global = 'PRETRANSLATED_' + langCode.toUpperCase();
  if (window[global]) return Promise.resolve();
  if (pretranslatedLangLoads[langCode]) return pretranslatedLangLoads[langCode];
  pretranslatedLangLoads[langCode] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'assets/translations/' + langCode + '.js';
    s.onload = () => window[global] ? resolve() : reject(new Error('loaded but empty: ' + langCode));
    s.onerror = () => { delete pretranslatedLangLoads[langCode]; reject(new Error('failed to load ' + langCode)); };
    document.head.appendChild(s);
  });
  return pretranslatedLangLoads[langCode];
}

// Serves this block's translation from pre-generated static content
// (see assets/translations/*.js) — a local decrypt once the language file
// is loaded. Returns the translated HTML on a hit, or null if this
// module/language/block combination isn't covered, the key isn't cached,
// or the block's English text has changed since the translation was
// generated — the hash guards against ever showing a stale translation of
// edited content. On a null return the caller leaves that block in English.
async function tryPretranslatedBlock(idx, blockPosition, blockEl, language) {
  const langCode = PRETRANSLATED_LANGUAGE_CODES[language];
  if (!langCode) return null;
  try { await ensurePretranslatedLang(langCode); } catch (e) { return null; }
  const table = window['PRETRANSLATED_' + langCode.toUpperCase()];
  const entries = table && table[idx];
  const entry = entries && entries[blockPosition];
  if (!entry) return null;

  const currentHash = await hashBlockElement(blockEl);
  if (currentHash !== entry.hash) return null;

  const unlock = window.getUnlockKeyForModule && window.getUnlockKeyForModule(idx);
  if (!unlock) return null; // no cached key — can't decrypt the translation

  // Try both variants regardless of which key type is cached, exactly like
  // attemptUnlockModule() does for the English content — cheap, and robust
  // to either key having been the one that actually unlocked this device.
  let plaintext = await tryDecrypt(entry.individual, unlock.key);
  if (!plaintext) plaintext = await tryDecrypt(entry.bundle, unlock.key + '::sec-' + idx);
  return plaintext || null;
}

// A language is only offered for THIS module if every single block has a
// matching, non-stale pretranslated entry — no partial "3 kept in
// English" surprises from the dropdown. Modules with no (or incomplete)
// pretranslated coverage simply don't list that language.
//
// Reads the hashes-only manifest (window.PRETRANSLATED_MANIFEST, ~10 KB,
// loaded eagerly) rather than the full per-language ciphertext files, so
// deciding the dropdown never triggers a multi-MB download. Manifest shape
// is { langCode: { moduleIdx: [hash, hash, ...] } }.
//
// It also requires a usable decryption key (getUnlockKeyForModule) — the
// pretranslated content is encrypted exactly like the English original,
// so with no cached key NONE of it can be served. Without this check the
// dropdown would offer a language it then can't actually apply, leaving
// every block in English — the "deep dive reverts to English" symptom.
// hasUnlockKey is surfaced separately so refreshTranslateLockUI can show
// "re-enter your key" instead of "not available yet".
async function getFullyCoveredLanguages(idx, blocks) {
  const covered = [];
  const hasUnlockKey = !!(window.getUnlockKeyForModule && window.getUnlockKeyForModule(idx));
  if (!hasUnlockKey) return { covered, hasUnlockKey };
  const manifest = window.PRETRANSLATED_MANIFEST || {};
  for (const [language, langCode] of Object.entries(PRETRANSLATED_LANGUAGE_CODES)) {
    const hashes = manifest[langCode] && manifest[langCode][idx];
    if (!hashes || hashes.length !== blocks.length) continue;
    let allMatch = true;
    for (let i = 0; i < blocks.length; i++) {
      const hash = await hashBlockElement(blocks[i]);
      if (hash !== hashes[i]) { allMatch = false; break; }
    }
    if (allMatch) covered.push(language);
  }
  return { covered, hasUnlockKey };
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
//
// Also where the language dropdown gets (re)built for real: a still-locked
// module has no real DOM content to check coverage against (ciphertext
// only), so the options list can only be computed once revealModule() has
// populated .unlocked-content — this runs on every unlock for exactly
// that reason.
function refreshTranslateLockUI(idx) {
  const section = document.getElementById('sec-' + idx);
  const box = section && section.querySelector('.translate-controls');
  if (!box) return;
  const locked = !!section.querySelector('.locked-gate:not(.unlocked)');
  const select = box.querySelector('.translate-lang-select');
  const btn = box.querySelector('.translate-btn');
  const statusEl = box.querySelector('.translate-status');

  if (locked) {
    select.disabled = true;
    btn.disabled = true;
    btn.title = 'Unlock this module first, then translate it.';
    statusEl.textContent = '🔒 Unlock to translate';
    return;
  }

  const blocks = getTranslatableBlocks(section);
  getFullyCoveredLanguages(idx, blocks).then(({ covered: languages, hasUnlockKey }) => {
    const deviceDefault = detectDeviceTranslateDefault();
    if (!languages.length) {
      const noKey = !hasUnlockKey;
      select.innerHTML = '<option value="">' +
        (noKey ? 'Re-enter your license key to enable translation' : 'No languages available yet') +
        '</option>';
      select.disabled = true;
      btn.disabled = true;
      btn.title = noKey
        ? 'This module was restored from an earlier session without its license key — re-enter the key (any module’s unlock box, or the sidebar) to enable translation.'
        : 'Translation for this module isn’t ready yet — check back in a future update.';
      statusEl.textContent = '';
      return;
    }
    select.innerHTML =
      '<option value="">🌐 Choose a language…</option>' +
      languages.map((lang) =>
        '<option value="' + lang + '"' + (lang === deviceDefault ? ' selected' : '') + '>' + lang + '</option>'
      ).join('');
    select.disabled = false;
    btn.disabled = false;
    btn.title = '';
    statusEl.textContent = '';
  });
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

  const blocks = getTranslatableBlocks(section);
  if (!blocks.length) {
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

  // Pull the (up to ~4.5 MB) language file now, once, with its own status —
  // it's fetched on first use rather than at page load. The SW caches it,
  // so this only actually downloads the first time this language is picked
  // on this device.
  const langCode = PRETRANSLATED_LANGUAGE_CODES[language];
  if (langCode && !window['PRETRANSLATED_' + langCode.toUpperCase()]) {
    statusEl.textContent = 'Loading ' + language + ' translations…';
    try {
      await ensurePretranslatedLang(langCode);
    } catch (e) {
      statusEl.textContent = 'Couldn’t load the ' + language + ' translation file — check your connection and try again.';
      translateBtn.disabled = false;
      return;
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!originals.has(block)) originals.set(block, block.innerHTML);

    statusEl.textContent = 'Translating ' + (i + 1) + ' of ' + blocks.length + ' to ' + language + '…';
    const pretranslated = await tryPretranslatedBlock(idx, i, block, language).catch(() => null);
    if (pretranslated) {
      block.innerHTML = pretranslated;
      translatedCount++;
      continue;
    }

    // Every offered language is fully pre-translated (getFullyCoveredLanguages
    // gates the dropdown on that AND a usable key), so reaching here means
    // this one block's English text changed since the pre-translation was
    // generated — its hash no longer matches. There used to be a live Groq
    // API fallback here, but it was unreliable (rate limits, truncated
    // responses on big deep-dive cards) and is no longer needed now that
    // coverage is comprehensive — leave the block in English and report it.
    failedCount++;
  }

  statusEl.textContent = failedCount
    ? 'Translated ' + translatedCount + ' of ' + blocks.length + ' — ' + failedCount +
      ' block' + (failedCount === 1 ? '' : 's') + ' changed since translation and stayed in English.'
    : 'Translated all ' + translatedCount + ' to ' + language + '.';
  translateBtn.disabled = false;
  revertBtn.style.display = '';
}

function revertModuleTranslation(idx) {
  const originals = translateOriginals[idx];
  if (!originals) return;
  originals.forEach((html, card) => { card.innerHTML = html; });

  const section = document.getElementById('sec-' + idx);
  section.querySelector('.translate-revert-btn').style.display = 'none';
  section.querySelector('.translate-status').textContent = '';
}

document.addEventListener('DOMContentLoaded', addTranslateControlsToModules);

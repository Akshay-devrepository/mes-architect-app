// ══════════════════════════════════════════
// LICENSE.JS — client-side unlock for paid modules.
//
// Honest about what this is: this is Option C from the design discussion —
// encrypted content with no backend. AES-256-GCM (Web Crypto, native to
// every modern browser/WebView) means a wrong key fails cleanly (no partial
// garbage output), and locked module content is never present in the page
// source as plaintext — view-source only shows ciphertext. But once a
// correct key decrypts it client-side, the plaintext exists in that
// browser's memory/DOM, so a sufficiently determined user could still
// extract it after unlocking. There is no way to fully prevent that without
// a server that never sends the plaintext to unlicensed clients at all.
// ══════════════════════════════════════════

const LICENSE_PBKDF2_ITERATIONS = 100000; // must match scripts/encrypt-modules.js
const UNLOCKED_CACHE_KEY = 'mes_unlocked_content_v1'; // { [moduleIndex]: decryptedHtml }
const BUNDLE_KEY_CACHE_KEY = 'mes_bundle_key_v1';
const INDIVIDUAL_KEY_CACHE_KEY = 'mes_individual_keys_v1'; // { [moduleIndex]: rawKey }

// ── Purchase links now live in assets/purchase-links.js (window.PURCHASE_LINKS),
// shared with the standalone sales page at buy.html so both "Buy" surfaces
// read the same config and can't drift. ──

// Checkout for exactly this one module (section index → on-screen number).
// Deliberately never falls back to the bundle link: "Purchase Access to
// This Module" must not quietly sell the ₹2,499 bundle. null → the caller
// shows its "contact the seller" fallback instead.
function purchaseLinkFor(moduleIndex) {
  return PURCHASE_LINKS.hrefFor(moduleIndex + 1);
}
window.purchaseLinkFor = purchaseLinkFor;

function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function deriveAesKey(passphrase, saltB64) {
  const salt = b64ToBuf(saltB64);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: LICENSE_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function tryDecrypt(encObj, passphrase) {
  try {
    const key = await deriveAesKey(passphrase, encObj.salt);
    const iv = b64ToBuf(encObj.iv);
    const ctWithTag = b64ToBuf(encObj.ct);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ctWithTag);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    return null; // wrong key -> GCM authentication fails -> throws -> treat as "no match"
  }
}

function loadUnlockedCache() {
  try { return JSON.parse(localStorage.getItem(UNLOCKED_CACHE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveUnlockedCache(map) {
  localStorage.setItem(UNLOCKED_CACHE_KEY, JSON.stringify(map));
}

function revealModule(gate, plaintext) {
  const unlockedDiv = gate.nextElementSibling;
  unlockedDiv.innerHTML = window.neutralizeInlineHandlers(plaintext);
  unlockedDiv.style.display = '';
  gate.style.display = 'none';
  gate.classList.add('unlocked');
  // Newly-revealed content needs the same DOM-scanning enhancements every
  // other module already got on page load.
  if (window.injectStars) window.injectStars();
  if (window.wrapTables) window.wrapTables();
  const grid = document.getElementById('homeGrid');
  if (grid) grid.dataset.built = '0'; // force the lock badge to refresh next Home render
  // Quiz Mode memoizes its deck the first time anything asks for it (see
  // enhance.js buildQuizDeck) — that can happen before this module's
  // content exists yet (enhance.js's own DOMContentLoaded handler runs
  // before this file's restore-from-cache loop finishes), silently
  // freezing its questions out of the deck for the rest of the session.
  // `quizDeck` is enhance.js's shared top-level `let` — reachable here
  // since both files execute in the same global scope.
  if (typeof quizDeck !== 'undefined') quizDeck = null;
  // Mock Interview & Quiz Mode's #quiz-root mount point doesn't exist
  // until this exact reveal — showSection(16) already calls renderQuiz()
  // on navigation, but a user can also unlock while already sitting on
  // this now-locked module without navigating away and back.
  if (gate.dataset.module === '16' && window.renderQuiz) window.renderQuiz();
  // The translate controls were built once on page load and dimmed/disabled
  // for whichever modules were still locked at that point — re-check now
  // that this one just unlocked.
  if (window.refreshTranslateLockUI) window.refreshTranslateLockUI(gate.dataset.module);
}

// Each locked module's ciphertext lives in assets/modules/sec-<idx>.json
// (see scripts/split-module-ciphertext.js) instead of inline in index.html,
// so the ~4.4 MB of it is only downloaded for a module someone actually
// tries a key on. The service worker pre-caches these files in the
// background after install, so unlocking still works offline. The path is
// built from the numeric index only — never from page-supplied text.
const moduleCiphertextCache = {};
function loadModuleCiphertext(idx) {
  const n = parseInt(idx, 10);
  if (!Number.isInteger(n) || n < 0) return Promise.reject(new Error('bad module index'));
  if (!moduleCiphertextCache[n]) {
    moduleCiphertextCache[n] = fetch('assets/modules/sec-' + n + '.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch((e) => { delete moduleCiphertextCache[n]; throw e; });
  }
  return moduleCiphertextCache[n];
}

// Resolves to false (key doesn't fit), 'individual' or 'bundle' (which
// kind of key it was). Rejects only if the ciphertext couldn't be loaded.
async function attemptUnlockModule(gate, keyInput) {
  const idx = gate.dataset.module;
  const { individual, bundle } = await loadModuleCiphertext(idx);

  let plaintext = await tryDecrypt(individual, keyInput);
  let matchedBundle = false;
  if (!plaintext) {
    plaintext = await tryDecrypt(bundle, keyInput + '::sec-' + idx);
    matchedBundle = !!plaintext;
  }
  if (!plaintext) return false;

  const cache = loadUnlockedCache();
  cache[idx] = plaintext;
  saveUnlockedCache(cache);
  if (matchedBundle) {
    localStorage.setItem(BUNDLE_KEY_CACHE_KEY, keyInput);
  } else {
    // Mirrors the bundle-key persistence above — needed so a later action
    // that re-decrypts THIS module's content with a different ciphertext
    // (e.g. loading a pre-translated language variant, see translate.js)
    // can reuse the same already-proven key instead of re-prompting.
    let individualKeys = {};
    try { individualKeys = JSON.parse(localStorage.getItem(INDIVIDUAL_KEY_CACHE_KEY)) || {}; } catch (e) {}
    individualKeys[idx] = keyInput;
    localStorage.setItem(INDIVIDUAL_KEY_CACHE_KEY, JSON.stringify(individualKeys));
  }
  revealModule(gate, plaintext);
  return matchedBundle ? 'bundle' : 'individual';
}

// Account-based unlock (assets/account.js): content comes from the API
// already decrypted, and goes through the same reveal + offline cache.
function revealModuleFromServer(section, html) {
  const gate = document.querySelector('.locked-gate[data-module="' + section + '"]');
  if (!gate || gate.classList.contains('unlocked')) return;
  const cache = loadUnlockedCache();
  cache[section] = html;
  saveUnlockedCache(cache);
  revealModule(gate, html);
}
window.revealModuleFromServer = revealModuleFromServer;

function forgetUnlockedModules(sections) {
  const cache = loadUnlockedCache();
  sections.forEach((s) => { delete cache[s]; });
  saveUnlockedCache(cache);
}
window.forgetUnlockedModules = forgetUnlockedModules;

// The raw AES passphrase that successfully unlocked a given module, if
// still available — either its own individual key, or the bundle key
// (reconstructed the same way attemptUnlockModule() derives it). Used to
// decrypt OTHER ciphertext for the same module (pre-translated language
// variants) without asking the user to re-enter anything.
function getUnlockKeyForModule(idx) {
  let individualKeys = {};
  try { individualKeys = JSON.parse(localStorage.getItem(INDIVIDUAL_KEY_CACHE_KEY)) || {}; } catch (e) {}
  if (individualKeys[idx]) return { key: individualKeys[idx], isBundle: false };
  const bundleKey = localStorage.getItem(BUNDLE_KEY_CACHE_KEY);
  if (bundleKey) return { key: bundleKey, isBundle: true };
  return null;
}
window.getUnlockKeyForModule = getUnlockKeyForModule;

async function unlockAllWithKey(key) {
  const gates = document.querySelectorAll('.locked-gate:not(.unlocked)');
  for (const gate of gates) {
    // A module whose file can't be fetched right now (offline, first visit)
    // just stays locked; the others still get their chance.
    await attemptUnlockModule(gate, key).catch(() => false);
  }
  refreshHomeIfActive();
}

window.unlockAllWithKey = unlockAllWithKey;

// revealModule() already invalidates the Home card grid's cache
// (grid.dataset.built = '0') on every unlock, but invalidating isn't the
// same as re-rendering — if Home happens to be the screen currently on
// screen (index null in the main script's currentSection), its cards
// would otherwise keep showing stale locked/"coming soon" badges until
// the user navigates away and back. currentSection/window.renderHome are
// the main inline script's globals, reachable here since every script on
// this page shares one global scope.
function refreshHomeIfActive() {
  if (typeof currentSection !== 'undefined' && currentSection === null && window.renderHome) {
    window.renderHome();
  }
}

// Licence-key entry (per-module box and the sidebar "Have a license key?"
// row) was removed: buyers unlock by signing in (account.js), with access
// granted by the payment webhook. Keys already saved on a device from
// before still restore their modules on load (below).

function addGlobalLicenseUI() {
  const footer = document.getElementById('sidebarFooter');
  if (!footer || document.getElementById('globalLicenseRow')) return;
  const bundleHref = PURCHASE_LINKS.hrefFor('bundle');
  const buyRow = bundleHref
    ? '<a class="global-buy-link" data-checkout="bundle" href="' + escapeHtml(bundleHref) + '" target="_blank" rel="noopener">💳 Get full access</a>'
    : '<button class="global-buy-link global-buy-request" type="button" data-checkout="bundle">💳 Purchase Full Access</button>';
  const row = document.createElement('div');
  row.id = 'globalLicenseRow';
  row.innerHTML = buyRow;
  footer.appendChild(row);
  if (!PURCHASE_LINKS.bundle) {
    row.querySelector('.global-buy-request').addEventListener('click', () => {
      if (window.requestPurchaseForModule) window.requestPurchaseForModule('the full MES Architect bundle');
    });
  }
}

// Inserts a "Buy Access" link (or a "contact the seller" fallback if no
// link is configured for this module yet) into a still-locked gate, above
// the "Already bought it? Sign in" prompt.
// Curiosity-hook teaser — a few persuasive lines of real prose, shown
// above the plain buy / sign-in instructions so a prospective
// buyer reads something enticing before the transactional copy, not after.
// Deliberately not written for every module (see module-preview-data.js) —
// only where a genuine hook earns the extra attention above the fold.
function addPreviewHookToGate(gate) {
  if (gate.querySelector('.locked-hook')) return;
  const idx = parseInt(gate.dataset.module, 10);
  const hook = window.MODULE_PREVIEW_HOOK && window.MODULE_PREVIEW_HOOK[idx];
  if (!hook) return;

  const titleEl = gate.querySelector('.locked-title');
  if (!titleEl) return;

  const p = document.createElement('div');
  p.className = 'locked-hook';
  p.textContent = hook;
  titleEl.insertAdjacentElement('afterend', p);
}

// "What's inside" teaser — a few genuine topic bullets pulled from the
// module's real content (see module-preview-data.js), shown under the Buy
// button and above "Already bought it? Sign in". Anchored off .locked-signin
// so it renders correctly whichever of the gate helpers runs first.
function addPreviewTopicsToGate(gate) {
  if (gate.querySelector('.locked-preview-topics')) return;
  const idx = parseInt(gate.dataset.module, 10);
  const topics = window.MODULE_PREVIEW_TOPICS && window.MODULE_PREVIEW_TOPICS[idx];
  if (!topics || !topics.length) return;

  const signIn = gate.querySelector('.locked-signin');
  if (!signIn) return;

  const box = document.createElement('div');
  box.className = 'locked-preview-topics';
  box.innerHTML =
    '<div class="locked-preview-label">🔍 What\'s inside</div>' +
    '<ul class="locked-preview-list">' +
      topics.map((t) => '<li>' + escapeHtml(t) + '</li>').join('') +
    '</ul>';
  // Hook → Buy → What's inside → "Already bought it? Sign in".
  gate.insertBefore(box, signIn);
}

function addBuyLinkToGate(gate) {
  if (gate.querySelector('.locked-buy-row')) return;
  const idx = parseInt(gate.dataset.module, 10);
  const link = purchaseLinkFor(idx);
  const title = (typeof sectionTitles !== 'undefined' && sectionTitles[idx]) || ('Module ' + (idx + 1));
  const bundleHref = PURCHASE_LINKS.hrefFor('bundle');
  const row = document.createElement('div');
  row.className = 'locked-buy-row';
  row.innerHTML = (link
    ? '<a class="locked-buy-btn" data-checkout="' + (idx + 1) + '" href="' + escapeHtml(link) + '" target="_blank" rel="noopener">💳 Purchase Access to This Module</a>'
    : '<button class="locked-buy-btn locked-buy-request" type="button" data-checkout="' + (idx + 1) + '">💳 Purchase Access to This Module</button>') +
    (bundleHref
      ? '<a class="locked-buy-bundle" data-checkout="bundle" href="' + escapeHtml(bundleHref) + '" target="_blank" rel="noopener">or unlock all 16 modules</a>'
      : '');
  // Hook → Buy → What's inside → "Already bought it? Sign in".
  gate.insertBefore(row, gate.querySelector('.locked-preview-topics') || gate.querySelector('.locked-signin'));
  if (!link) {
    row.querySelector('.locked-buy-request').addEventListener('click', () => {
      if (window.requestPurchaseForModule) window.requestPurchaseForModule(title);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const hasLockedModules = document.querySelector('.locked-gate');
  if (!hasLockedModules) return;

  addGlobalLicenseUI();

  // Restore anything unlocked in an earlier visit.
  const cache = loadUnlockedCache();
  document.querySelectorAll('.locked-gate').forEach((gate) => {
    const idx = gate.dataset.module;
    if (cache[idx]) revealModule(gate, cache[idx]);
  });

  document.querySelectorAll('.locked-gate:not(.unlocked)').forEach(addPreviewHookToGate);
  document.querySelectorAll('.locked-gate:not(.unlocked)').forEach(addPreviewTopicsToGate);
  document.querySelectorAll('.locked-gate:not(.unlocked)').forEach(addBuyLinkToGate);

  // If a bundle key was validated before, auto-unlock anything still
  // locked (covers a case where more modules got added after they bought).
  const savedBundleKey = localStorage.getItem(BUNDLE_KEY_CACHE_KEY);
  if (savedBundleKey) await unlockAllWithKey(savedBundleKey);

  // enhance.js's own DOMContentLoaded handler (which builds the Home stats
  // strip) runs before this one finishes restoring cached-unlocked modules
  // — refresh it now that the true unlock state actually exists.
  if (window.renderHomeStats) window.renderHomeStats();
  // The Home card grid was already built once (by the main script's own
  // synchronous INIT block, before this handler had restored anything from
  // cache) — without this, a returning user whose modules were already
  // unlocked in a previous session sees stale "locked"/"coming soon" home
  // cards on launch until they navigate away and back. That first build
  // also ran before this file defined purchaseLinkFor, so its Buy buttons
  // had no checkout links — force one rebuild even if no lock state changed.
  const homeGrid = document.getElementById('homeGrid');
  if (homeGrid) homeGrid.dataset.built = '0';
  refreshHomeIfActive();
});

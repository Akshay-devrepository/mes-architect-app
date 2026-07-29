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

// ── Purchase links — fill these in once your Gumroad/LemonSqueezy products
// exist, then redeploy. This is a plain runtime config (not part of the
// encryption build step), so you can update prices/links anytime without
// re-running scripts/encrypt-modules.js or invalidating any keys.
// Keys are 1-based module numbers to match LICENSE-KEYS-SECRET.md. ──
const PURCHASE_LINKS = {
  bundle: null, // e.g. 'https://yourname.gumroad.com/l/mes-architect-bundle'
  modules: {
    // 2: 'https://yourname.gumroad.com/l/mes-isa95',
    // 3: 'https://yourname.gumroad.com/l/mes-isa88',
    // ...add one per module you sell individually
  }
};

function purchaseLinkFor(moduleIndex) {
  return PURCHASE_LINKS.modules[moduleIndex + 1] || PURCHASE_LINKS.bundle || null;
}
window.purchaseLinkFor = purchaseLinkFor;

// ── Keygen.sh integration (optional layer in front of the AES unlock below) ──
// Set this to your Keygen account slug (Settings → the id in your dashboard
// URL — public, not a secret) to let buyers enter a real Keygen-issued
// license key instead of a raw AES passphrase. Each Keygen License's
// metadata.unlockKey field should hold the actual module/bundle passphrase
// from LICENSE-KEYS-SECRET.md — that passphrase is fetched fresh from
// Keygen's response only after a valid check, never embedded in this file
// or shown to the buyer directly. Leave blank to skip Keygen entirely and
// only accept raw passphrases (today's behavior).
const KEYGEN_ACCOUNT_ID = '';

const KEYGEN_ERROR_MESSAGES = {
  NOT_FOUND: null, // not a recognized Keygen key — caller falls back to raw-passphrase
  EXPIRED: 'This license key has expired.',
  SUSPENDED: 'This license key has been suspended.',
  BANNED: 'This license key has been banned.',
  TOO_MANY_MACHINES: 'This license key has already been activated on its device limit.',
  FRAUD: 'This license key was flagged and is no longer valid.'
};

// ── Device activation limit ──
// Enforced by Keygen's own policy settings (maxMachines + strict mode), not
// by anything in this file — see README "Limiting activations per key".
// This device gets a random, locally-stored id the first time a Keygen key
// is entered (there's no stable hardware fingerprint available from a
// browser/WebView without a native plugin, so clearing site data or
// reinstalling the app looks like "a new device" and uses another
// activation slot — documented, not hidden). Activation itself only
// happens once per device: after that this flag skips straight to
// validate-only for every later key entry, so applying multiple module
// keys on an already-activated device never risks tripping the limit.
const DEVICE_FINGERPRINT_KEY = 'mes_device_fingerprint_v1';
const KEYGEN_ACTIVATED_FLAG_KEY = 'mes_keygen_activated_v1';

function getDeviceFingerprint() {
  let fp = localStorage.getItem(DEVICE_FINGERPRINT_KEY);
  if (fp) return fp;
  if (window.crypto && crypto.randomUUID) {
    fp = 'dev-' + crypto.randomUUID();
  } else {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    fp = 'dev-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  localStorage.setItem(DEVICE_FINGERPRINT_KEY, fp);
  return fp;
}

// Activates this device as a "machine" against the license (once per
// device — see comment above). Returns { ok: true } on success, or
// { ok: false, message } — most importantly when the policy's machine
// limit is already used up, in which case Keygen rejects the activation
// and that message is passed straight through to the user.
async function ensureMachineActivated(key, licenseId) {
  if (localStorage.getItem(KEYGEN_ACTIVATED_FLAG_KEY) === '1') return { ok: true };
  let res;
  try {
    res = await fetch('https://api.keygen.sh/v1/accounts/' + KEYGEN_ACCOUNT_ID + '/machines', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
        'Authorization': 'License ' + key
      },
      body: JSON.stringify({
        data: {
          type: 'machines',
          attributes: { fingerprint: getDeviceFingerprint(), platform: (navigator.platform || 'web') },
          relationships: { license: { data: { type: 'licenses', id: licenseId } } }
        }
      })
    });
  } catch (e) {
    return { ok: false, message: 'Could not reach the license server to activate this device — check your connection and try again.' };
  }
  if (res.status === 201) {
    localStorage.setItem(KEYGEN_ACTIVATED_FLAG_KEY, '1');
    return { ok: true };
  }
  let body = null;
  try { body = await res.json(); } catch (e) {}
  const detail = body && body.errors && body.errors[0] && (body.errors[0].detail || body.errors[0].title);
  return { ok: false, message: detail || 'This license key has already been activated on its device limit.' };
}

// Returns { ok: true, unlockKey } on a valid Keygen license that this
// device successfully activated against, { ok: false, message } on a
// definitive Keygen rejection (expired/suspended/device limit/etc — don't
// fall back), or null if Keygen wasn't reachable / configured / didn't
// recognize the key at all (caller should fall back to a raw passphrase).
async function validateKeygenLicense(key) {
  if (!KEYGEN_ACCOUNT_ID) return null;
  let res;
  try {
    res = await fetch('https://api.keygen.sh/v1/accounts/' + KEYGEN_ACCOUNT_ID + '/licenses/actions/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.api+json', 'Accept': 'application/vnd.api+json' },
      body: JSON.stringify({ meta: { key } })
    });
  } catch (e) {
    return null; // offline, CORS, Keygen down, etc — fall back to raw-passphrase
  }
  let body;
  try { body = await res.json(); } catch (e) { return null; }

  const code = body && body.meta && body.meta.code;
  if (!(body && body.meta && body.meta.valid)) {
    if (code === 'NOT_FOUND' || !code) return null; // not a Keygen key we recognize — try raw-passphrase
    return { ok: false, message: KEYGEN_ERROR_MESSAGES[code] || ('This license key isn’t valid (' + code + ').') };
  }

  const licenseId = body.data && body.data.id;
  const unlockKey = body.data && body.data.attributes && body.data.attributes.metadata &&
    body.data.attributes.metadata.unlockKey;
  if (!unlockKey || !licenseId) {
    return { ok: false, message: 'This license key is valid but isn’t configured to unlock anything — contact the seller.' };
  }

  const activation = await ensureMachineActivated(key, licenseId);
  if (!activation.ok) return { ok: false, message: activation.message };

  return { ok: true, unlockKey };
}

// Resolves whatever the user typed into the actual AES passphrase to try:
// if it's a valid Keygen license, that license's own unlockKey; otherwise
// (Keygen not configured, offline, or not a Keygen key at all) the raw
// input itself, preserving the original no-backend behavior as a fallback.
async function resolveUnlockKey(rawInput) {
  const keygenResult = await validateKeygenLicense(rawInput);
  if (keygenResult === null) return { key: rawInput, error: null };
  if (keygenResult.ok) return { key: keygenResult.unlockKey, error: null };
  return { key: null, error: keygenResult.message };
}

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
  unlockedDiv.innerHTML = plaintext;
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
  // The AI Coach's mic/speaker buttons live inside Module 8's own gated
  // content, so they don't exist in the DOM (and can't be initialized)
  // until whichever module was unlocked reveals them — a no-op call for
  // every module except 8, where the AI chat markup lives.
  if (window.initVoiceInput) window.initVoiceInput();
  if (window.updateVoiceOutButton) window.updateVoiceOutButton();
}

async function attemptUnlockModule(gate, keyInput) {
  const idx = gate.dataset.module;
  const individual = JSON.parse(gate.dataset.individual);
  const bundle = JSON.parse(gate.dataset.bundle);

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
  if (matchedBundle) localStorage.setItem(BUNDLE_KEY_CACHE_KEY, keyInput);
  revealModule(gate, plaintext);
  return true;
}

async function unlockAllWithKey(key) {
  const gates = document.querySelectorAll('.locked-gate:not(.unlocked)');
  for (const gate of gates) {
    await attemptUnlockModule(gate, key);
  }
}
window.unlockAllWithKey = unlockAllWithKey;

async function tryUnlockGate(button) {
  const gate = button.closest('.locked-gate');
  const input = gate.querySelector('.locked-key-input');
  const errorEl = gate.querySelector('.locked-error');
  const rawKey = input.value.trim();
  if (!rawKey) return;
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Checking…';

  const resolved = await resolveUnlockKey(rawKey);
  let ok = false;
  if (resolved.key) ok = await attemptUnlockModule(gate, resolved.key);

  button.disabled = false;
  button.textContent = originalLabel;
  if (!ok) {
    errorEl.textContent = resolved.error || 'That key didn’t unlock this module — check for typos.';
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';
  // A key that worked here might be a bundle key that also unlocks every
  // other still-locked module — sweep the rest right away.
  await unlockAllWithKey(resolved.key);
}
window.tryUnlockGate = tryUnlockGate;

// ── Global "enter a license key" entry point (sidebar footer) — lets
//    someone unlock without having to open the specific module first. ──
async function tryGlobalUnlock() {
  const input = document.getElementById('globalLicenseInput');
  const status = document.getElementById('globalLicenseStatus');
  const rawKey = input.value.trim();
  if (!rawKey) return;
  status.textContent = 'Checking…';

  const resolved = await resolveUnlockKey(rawKey);
  if (!resolved.key) {
    status.textContent = resolved.error || 'That key didn’t match anything.';
    setTimeout(() => { status.textContent = ''; }, 5000);
    return;
  }

  const before = document.querySelectorAll('.locked-gate:not(.unlocked)').length;
  await unlockAllWithKey(resolved.key);
  const after = document.querySelectorAll('.locked-gate:not(.unlocked)').length;
  const unlockedCount = before - after;
  if (unlockedCount > 0) {
    status.textContent = '✓ Unlocked ' + unlockedCount + ' module' + (unlockedCount === 1 ? '' : 's') + '.';
    input.value = '';
  } else {
    status.textContent = 'That key didn’t match anything still locked.';
  }
  setTimeout(() => { status.textContent = ''; }, 4000);
}
window.tryGlobalUnlock = tryGlobalUnlock;

function addGlobalLicenseUI() {
  const footer = document.getElementById('sidebarFooter');
  if (!footer || document.getElementById('globalLicenseRow')) return;
  const buyRow = PURCHASE_LINKS.bundle
    ? '<a class="global-buy-link" href="' + PURCHASE_LINKS.bundle + '" target="_blank" rel="noopener">💳 Get full access</a>'
    : '';
  const row = document.createElement('div');
  row.id = 'globalLicenseRow';
  row.innerHTML =
    buyRow +
    '<div class="global-license-label">🔑 Have a license key?</div>' +
    '<div class="global-license-input-row">' +
      '<input type="text" id="globalLicenseInput" placeholder="Paste key" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button onclick="tryGlobalUnlock()">Apply</button>' +
    '</div>' +
    '<div class="global-license-hint">Same key works on any device — just paste it again here.</div>' +
    '<div id="globalLicenseStatus" class="global-license-status"></div>';
  footer.appendChild(row);
}

// Inserts a "Buy Access" link (or a "contact the seller" fallback if no
// link is configured for this module yet) into a still-locked gate, right
// above the key-entry row.
function addBuyLinkToGate(gate) {
  if (gate.querySelector('.locked-buy-row')) return;
  const idx = parseInt(gate.dataset.module, 10);
  const link = purchaseLinkFor(idx);
  const row = document.createElement('div');
  row.className = 'locked-buy-row';
  row.innerHTML = link
    ? '<a class="locked-buy-btn" href="' + link + '" target="_blank" rel="noopener">💳 Buy access to this module</a>'
    : '<div class="locked-buy-fallback">No purchase link set up yet — contact the seller for a license key.</div>';
  const inputRow = gate.querySelector('.locked-input-row');
  gate.insertBefore(row, inputRow);
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

  document.querySelectorAll('.locked-gate:not(.unlocked)').forEach(addBuyLinkToGate);

  // If a bundle key was validated before, auto-unlock anything still
  // locked (covers a case where more modules got added after they bought).
  const savedBundleKey = localStorage.getItem(BUNDLE_KEY_CACHE_KEY);
  if (savedBundleKey) await unlockAllWithKey(savedBundleKey);

  // enhance.js's own DOMContentLoaded handler (which builds the Home stats
  // strip) runs before this one finishes restoring cached-unlocked modules
  // — refresh it now that the true unlock state actually exists.
  if (window.renderHomeStats) window.renderHomeStats();
});

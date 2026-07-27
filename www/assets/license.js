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
  const key = input.value.trim();
  if (!key) return;
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Checking…';
  const ok = await attemptUnlockModule(gate, key);
  button.disabled = false;
  button.textContent = originalLabel;
  if (!ok) {
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';
  // A key that worked here might be a bundle key that also unlocks every
  // other still-locked module — sweep the rest right away.
  await unlockAllWithKey(key);
}
window.tryUnlockGate = tryUnlockGate;

// ── Global "enter a license key" entry point (sidebar footer) — lets
//    someone unlock without having to open the specific module first. ──
async function tryGlobalUnlock() {
  const input = document.getElementById('globalLicenseInput');
  const status = document.getElementById('globalLicenseStatus');
  const key = input.value.trim();
  if (!key) return;
  const before = document.querySelectorAll('.locked-gate:not(.unlocked)').length;
  status.textContent = 'Checking…';
  await unlockAllWithKey(key);
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
  const row = document.createElement('div');
  row.id = 'globalLicenseRow';
  row.innerHTML =
    '<div class="global-license-label">🔑 Have a license key?</div>' +
    '<div class="global-license-input-row">' +
      '<input type="text" id="globalLicenseInput" placeholder="Paste key" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button onclick="tryGlobalUnlock()">Apply</button>' +
    '</div>' +
    '<div id="globalLicenseStatus" class="global-license-status"></div>';
  footer.appendChild(row);
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

  // If a bundle key was validated before, auto-unlock anything still
  // locked (covers a case where more modules got added after they bought).
  const savedBundleKey = localStorage.getItem(BUNDLE_KEY_CACHE_KEY);
  if (savedBundleKey) await unlockAllWithKey(savedBundleKey);
});

// Both CI workflows overwrite this with 'mes-architect-v<git commit count>'
// at build time (see the "Stamp version" step), so every deploy gets a
// fresh cache automatically — this literal is only the local-dev default.
const CACHE_NAME = 'mes-architect-dev';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/enhance.css',
  './assets/fonts/fonts.css',
  './assets/actions.js',
  './assets/app.js',
  './assets/a11y.js',
  './assets/sw-register.js',
  './assets/enhance.js',
  './assets/quiz-data.js',
  './assets/glossary-data.js',
  './assets/module-preview-data.js',
  './assets/mindmap-data.js',
  './assets/mindmap.js',
  './assets/responsive.css',
  './assets/purchase-links.js',
  './assets/license.js',
  './assets/backend-config.js',
  './assets/account.js',
  './assets/translations-manifest.js',
  './assets/translate.js',
  './assets/build-version.js',
  './assets/update-check.js',
  './assets/vendor/capacitor.js',
  './assets/vendor/capacitor-app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Paid-module ciphertext (assets/modules/, ~4.4 MB in total). Kept out of
// APP_SHELL so it never delays install or first paint; fetched once the
// worker is active instead, so a license key still unlocks offline later.
// scripts/__tests__/sw-module-list.test.js keeps this list in sync with the
// files on disk.
const MODULE_FILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  .map((n) => './assets/modules/sec-' + n + '.json');

function warmModuleCache() {
  return caches.open(CACHE_NAME).then((cache) =>
    Promise.all(MODULE_FILES.map((url) =>
      cache.match(url).then((hit) => hit || cache.add(url)).catch(() => {})
    ))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).then(warmModuleCache)
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let Puter/fonts requests pass through untouched

  // Network-first for the app document and code/styles, so a new deploy is
  // visible on the very next reload instead of being masked by the cache.
  // Falls back to the cache only when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

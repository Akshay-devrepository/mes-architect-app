const CACHE_NAME = 'mes-architect-v63';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/enhance.css',
  './assets/enhance.js',
  './assets/quiz-data.js',
  './assets/glossary-data.js',
  './assets/module-preview-data.js',
  './assets/responsive.css',
  './assets/license.js',
  './assets/translations/fr.js',
  './assets/translations/de.js',
  './assets/translations/zh.js',
  './assets/translations/ja.js',
  './assets/translations/ko.js',
  './assets/translations/it.js',
  './assets/translate.js',
  './assets/build-version.js',
  './assets/update-check.js',
  './assets/vendor/capacitor.js',
  './assets/vendor/capacitor-app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
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

/* Offline cache for ORBLINGS.io. Bump CACHE when shipping new files. */
const CACHE = 'orblings-v1.0.0';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest', './assets/icon.svg',
  './js/config.js', './js/utils.js', './js/storage.js', './js/cosmetics.js', './js/physics.js',
  './js/entities.js', './js/collision.js', './js/ai.js', './js/world.js', './js/net.js',
  './js/effects.js', './js/audio.js', './js/haptics.js', './js/input.js', './js/renderer.js',
  './js/progression.js', './js/monetization.js', './js/ui.js', './js/game.js', './js/main.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// network-first so updates show up immediately; cache is the offline fallback
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

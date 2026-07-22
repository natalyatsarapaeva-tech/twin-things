/* Twin Things — service worker (офлайн-оболочка).
 * Network-first для навигаций/HTML (свежие обновления), cache-first для статики.
 * Cross-origin (Firestore, Storage, OpenAI worker, Google Fonts) — мимо кэша.
 * Поднимай CACHE при выкатке изменений, чтобы старый кэш сбрасывался.
 */
const CACHE = 'twin-things-v2';
const ASSETS = [
  './',
  './index.html',
  './item.html',
  './add-item.html',
  './rooms.html',
  './settings.html',
  './styles.css',
  './voice.js',
  './pwa.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // не блокировать install, если ассет 404
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // внешние запросы — в сеть

  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
      })
    )
  );
});

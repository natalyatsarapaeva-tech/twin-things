/* Twin Things — service worker (офлайн-оболочка).
 * Network-first для ВСЕГО своего origin (HTML + JS + CSS): свежий код всегда из
 * сети, кэш — только офлайн-фолбэк. Это важно для js/firebase.js: при cache-first
 * старый конфиг (напр. REPLACE_ME) «залипал» и ломал вход.
 * Cross-origin (Firestore, Storage, OpenAI worker, Google Fonts) — мимо кэша.
 * Поднимай CACHE при выкатке изменений, чтобы старый кэш сбрасывался.
 */
const CACHE = 'twin-things-v4';
const ASSETS = [
  './',
  './index.html',
  './item.html',
  './add-item.html',
  './settings.html',
  './styles.css',
  './voice.js',
  './pwa.js',
  './manifest.json',
  './js/firebase.js',
  './js/store.js',
  './js/catalog-core.js',
  './js/image.js',
  './js/ai.js',
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

// pwa.js просит ждущий SW активироваться немедленно (быстрое обновление на iOS).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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

  // Network-first для всего своего origin: онлайн — всегда свежий код/страница,
  // офлайн — отдаём последнюю успешную копию из кэша (для навигаций — index.html).
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) =>
        r || (req.mode === 'navigate' || req.destination === 'document'
          ? caches.match('./index.html') : undefined)))
  );
});

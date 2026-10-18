importScripts('./version.js');

const CACHE = 'app-v' + APP_VERSION;
const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './strings.js',
  './dates.js',
  './queue.js',
  './sync.js',
  './proposal.js',
  './today.js',
  './ladder.js',
  './review.js',
  './boot.js',
  './version.js',
  './config.js',
  './styles.css',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const res = await fetch(new Request('./version.js', { cache: 'reload' }));
    const m = /APP_VERSION\s*=\s*(\d+)/.exec(await res.text());
    if (!m || Number(m[1]) !== APP_VERSION) throw new Error('version.js と sw.js の版が違います');
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { ignoreSearch: true }).then(hit => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});

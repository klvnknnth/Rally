/* Rally service worker — cache the app shell; always hit network for match
 * pages and preview images (they encode live state). */
const SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/codec.js',
  '/js/chess.js',
  '/js/draughts.js',
  '/js/wordlist.js',
  '/js/word.js',
  '/js/share.js',
  '/js/pieces.js',
  '/js/app.js',
  '/icon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open('rally-v1').then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== 'rally-v1').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/m/') || u.pathname.startsWith('/og/')) return; // network only
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === 'GET' && res.ok) {
        const copy = res.clone();
        caches.open('rally-v1').then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});

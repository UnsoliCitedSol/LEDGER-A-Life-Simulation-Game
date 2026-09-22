/* LEDGER service worker.
 *
 * CACHING POLICY, deliberately chosen:
 *   navigations      -> NETWORK-FIRST, fall back to cache when offline.
 *                       The document is where every fix ships. A cache-first document
 *                       would happily serve a player last week's build - including one
 *                       that soft-locks - long after it was replaced. Updates must win.
 *   same-origin files-> cache-first, fill on miss (icons, manifest).
 *   everything else  -> stale-while-revalidate (Google Fonts), so the game still opens
 *                       on a plane, on system fonts if necessary.
 *
 * Bump CACHE on every deploy. Old caches are purged on activate, and skipWaiting plus
 * clients.claim mean a refreshed player is on the new cache immediately, not next visit.
 */
const CACHE = 'ledger-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
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

  /* The game page itself. Network-first: a republished build must reach players now. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((m) => m || caches.match('./'))
        )
    );
    return;
  }

  const url = new URL(req.url);

  /* Our own static files: cache-first, they only change when CACHE bumps. */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((m) =>
        m || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  /* Fonts and any other cross-origin fetch: serve what we have, refresh behind it. */
  e.respondWith(
    caches.match(req).then((m) => {
      const refresh = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => m);
      return m || refresh;
    })
  );
});

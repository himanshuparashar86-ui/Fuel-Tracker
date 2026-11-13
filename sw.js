/* Fuel Tracker: network-first shell, offline fallback. Never clears IndexedDB. */
const CACHE_NAME = 'fuel-tracker-shell-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async path => {
      try { await cache.add(new Request(path, {cache: 'reload'})); }
      catch (err) { console.warn('Could not precache', path, err); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('fuel-tracker-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // HTML navigations: try the network first so deployments are not pinned to stale HTML.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, {cache: 'no-store'});
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('Fuel Tracker is offline and no cached app shell is available yet.', {
            status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
          });
      }
    })());
    return;
  }

  // Static same-origin assets: network first, cached copy as offline fallback.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, {cache: 'no-store'});
      if (fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(req)) || Response.error();
    }
  })());
});

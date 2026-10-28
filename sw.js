// MGP Inventory service worker. Stale-while-revalidate: the app is served from the cache straight
// away, so a weak plant network never holds up the start, while the fresh copy is fetched behind it
// and used from the next open. A new CACHE name means a new version has landed, and the open app is
// told so it can offer a reload instead of needing a hard refresh.
const CACHE = 'mgp-inv-v2.5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  // added one by one: addAll() throws away the whole cache if a single file is missing
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      const old = keys.filter(k => k !== CACHE);
      return Promise.all(old.map(k => caches.delete(k)))
        .then(() => self.clients.claim())
        .then(() => {
          if (!old.length) return; // first install on this phone, not an update
          return self.clients.matchAll({type: 'window'})
            .then(cs => cs.forEach(c => c.postMessage({type: 'updated'})));
        });
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Apps Script / Google calls
  e.respondWith(
    caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) c.put(req, res.clone()).catch(() => {});
        return res;
      });
      if (hit) {                       // serve at once, refresh in the background
        e.waitUntil(net.catch(() => {}));
        return hit;
      }
      return net.catch(() => c.match('./index.html').then(m => m || Response.error()));
    }))
  );
});

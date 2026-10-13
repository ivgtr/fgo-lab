const CACHE = 'fgo-lab-shell-v5';
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./']))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.kind === 'fgo-lab-atlas-controller-check')
    event.ports[0]?.postMessage({ kind: 'fgo-lab-atlas-controller-ready', version: 5 });
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fgo-lab-shell-v') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate';
  const staticAsset = url.pathname.startsWith('/_next/static/') || url.pathname === '/favicon.ico';
  if (!navigation && !staticAsset) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const cached =
          (await cache.match(event.request)) || (navigation ? await cache.match('./') : undefined);
        if (!cached) return Response.error();
        const headers = new Headers(cached.headers);
        headers.set('X-Fgo-Lab-Cache', 'offline');
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }),
  );
});

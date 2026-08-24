const CACHE = 'fgo-lab-shell-v2';
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./']))),
);
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = (await caches.match(event.request)) || (await caches.match('./'));
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

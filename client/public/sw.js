const CACHE_NAME = 'creatoros-v3';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ['/', '/offline.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (url.pathname === '/api/health' || url.pathname === '/api/channels' || url.pathname === '/api/videos' || url.pathname === '/api/notifications' || url.pathname === '/api/ai-results' || url.pathname === '/api/cron-jobs')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'offline', cached: false }), {
              headers: { 'Content-Type': 'application/json' },
              status: 503,
            });
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || fetchPromise;
    }).catch(() => {
      if (request.destination === 'document') {
        return caches.match(OFFLINE_URL);
      }
      return new Response('', { status: 503 });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'preloadOffline') {
    const urls = ['/api/channels', '/api/videos', '/api/ai-results', '/api/notifications', '/api/cron-jobs'];
    caches.open(CACHE_NAME).then((cache) => {
      urls.forEach((url) => {
        fetch(url, { credentials: 'include' })
          .then((res) => { if (res.ok) cache.put(url, res); })
          .catch(() => {});
      });
    });
  }
});

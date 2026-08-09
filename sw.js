// Super League — Service Worker
// Strategy: cache the static app shell (HTML/CSS/JS/icons) so the app installs
// properly and opens instantly on repeat visits. Everything else (Supabase API
// calls, the Supabase JS library from its CDN) is left completely alone and
// always goes straight to the network — this is a live sports app, so cached
// scores or standings would be actively misleading. Only the shell is cached,
// never data.

const CACHE_NAME = 'super-league-shell-v2';

// Only these lightweight files get force-downloaded the moment someone visits.
// The larger icon files are still cacheable (see the fetch handler below), but
// only get fetched — and cached — the first time something actually requests
// them, usually when the OS shows an install prompt, rather than adding
// several hundred KB of upfront weight to every single page load.
const PRECACHE_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-32.png',
  './icons/icon-192.png'
];

// Every file the service worker is allowed to intercept/cache at all —
// precached files plus the heavier icons, cached lazily on first request.
const SHELL_FILES = [
  ...PRECACHE_FILES,
  './icons/icon-16.png',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each file individually (not addAll) so one bad/missing path
      // can never fail the entire install — that was the actual bug before.
      Promise.all(
        PRECACHE_FILES.map((file) =>
          cache.add(file).catch((err) => console.warn('Precache failed for', file, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const isSameOrigin = url.origin === self.location.origin;
  const isShellFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '')));

  if (event.request.method !== 'GET' || !isSameOrigin || !isShellFile) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

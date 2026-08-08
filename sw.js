// Super League — Service Worker
// Strategy: cache the static app shell (HTML/CSS/JS/icons) so the app installs
// properly and opens instantly. Everything else (Supabase API calls, the
// Supabase JS library from its CDN) is left completely alone and always goes
// straight to the network — this is a live sports app, so cached scores or
// standings would be actively misleading. Only the shell is cached, never data.

const CACHE_NAME = 'super-league-shell-v1';
const SHELL_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
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

  // Only handle GET requests for our own shell files. Everything else
  // (Supabase REST/Realtime calls, the Supabase JS CDN script, any other
  // origin) is left untouched so it always hits the real network.
  const isSameOrigin = url.origin === self.location.origin;
  const isShellFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '')));

  if (event.request.method !== 'GET' || !isSameOrigin || !isShellFile) {
    return; // let the browser handle it normally — no caching, no interception
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
        .catch(() => cached); // offline — fall back to whatever's cached

      // Cache-first for instant loads, but still refresh the cache in the background
      return cached || networkFetch;
    })
  );
});

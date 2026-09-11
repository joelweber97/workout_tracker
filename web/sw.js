/*
 * Offline support.
 *
 * Cache-first for the app shell: every file is precached on install, so the app
 * opens with no network at all — which is the normal case in a gym basement.
 * Bump CACHE_VERSION whenever a file changes; the old cache is dropped on
 * activate, and clients get the new build on their next launch.
 *
 * Nothing here touches training data. That lives in IndexedDB and never goes
 * near the network.
 */

const CACHE_VERSION = 'overload-v11';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/ai.js',
  './js/charts.js',
  './js/coach.js',
  './js/db.js',
  './js/domain.js',
  './js/format.js',
  './js/library.js',
  './js/picker.js',
  './js/gym.js',
  './js/rest.js',
  './js/store.js',
  './js/ui.js',
  './js/views/coach-view.js',
  './js/views/exercise-detail.js',
  './js/views/exercises.js',
  './js/views/history.js',
  './js/views/routine.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/today.js',
  './js/views/workout-detail.js',
  './js/views/workout.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // `cache: 'reload'` is load-bearing. A plain addAll() fetches through the
      // browser's HTTP cache, so a new cache version can be populated with the
      // very files it was bumped to replace — the app then serves a stale build
      // from a fresh-looking cache, indefinitely.
      .then((cache) => cache.addAll(
        SHELL.map((url) => new Request(url, { cache: 'reload' })),
      ))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Refresh in the background so the next launch gets any new build.
        event.waitUntil(refresh(request));
        return cached;
      }
      return fetch(request)
        .then((response) => store(request, response))
        // A navigation that misses the cache offline still gets the shell.
        .catch(() => (request.mode === 'navigate'
          ? caches.match('./index.html')
          : Response.error()));
    }),
  );
});

function store(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

function refresh(request) {
  // Revalidate against the server rather than accepting whatever the HTTP cache
  // holds, for the same reason install bypasses it.
  return fetch(new Request(request, { cache: 'no-cache' }))
    .then((response) => store(request, response))
    .catch(() => {});
}

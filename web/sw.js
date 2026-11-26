/* Service Worker for AI Nav Hub PWA
   Follows modern-web-guidance: performance (NetworkFirst for HTML, CacheFirst for versioned same-origin assets, StaleWhileRevalidate for JSON data; never caches opaque cross-origin responses) */

const STATIC_CACHE = "ai-nav-static-v2";
const PAGES_CACHE = "ai-nav-pages-v2";
const DATA_CACHE = "ai-nav-data-v2";
const VALID_CACHES = new Set([STATIC_CACHE, PAGES_CACHE, DATA_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        "/",
        "/favicon.png?v=5",
        "/apple-touch-icon.png?v=5",
        "/manifest.webmanifest",
      ]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !VALID_CACHES.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache cross-origin opaque responses
  if (url.origin !== self.location.origin) return;

  // 1. HTML document navigations: NetworkFirst with offline cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches.open(PAGES_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // 2. JSON data indices (catalog-hot.json, news.json, hotlist.json): StaleWhileRevalidate
  if (url.pathname.startsWith("/data/") && url.pathname.endsWith(".json") && !url.pathname.endsWith("catalog.json")) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const netPromise = fetch(request)
          .then((res) => {
            if (res.status === 200) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || netPromise;
      })
    );
    return;
  }

  // 3. Versioned same-origin CSS, JS, and local images: CacheFirst when ?v= present
  if (url.searchParams.has("v") && ["style", "script", "image"].includes(request.destination)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.status === 200) cache.put(request, res.clone());
        return res;
      })
    );
  }
});

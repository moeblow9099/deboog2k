const CACHE = "deboog2k4";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/base.css",
  "./styles/files.css",
  "./styles/modals.css",
  "./styles/viewer.css",
  "./styles/responsive.css",
  "./src/app.js",
  "./src/state.js",
  "./src/storage.js",
  "./src/library.js",
  "./src/folders.js",
  "./src/recents.js",
  "./src/search.js",
  "./src/import-engine.js",
  "./src/preview-engine.js",
  "./src/viewer.js"
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

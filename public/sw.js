/* eslint-disable no-undef */
/**
 * keys — service worker.
 *
 * The offline story splits in two:
 *
 *   this file  caches the *shell* — HTML, JS, CSS, fonts, icons — so the app
 *              boots with no connection at all.
 *   IndexedDB  holds the vault itself, as ciphertext, written by the app.
 *
 * Deliberately absent: any caching of /api responses. Vault data reaches the
 * client through the encrypted mirror, and caching authenticated JSON in the
 * Cache API would leave copies the app can't reason about.
 */

const VERSION = "keys-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const FONTS = `${VERSION}-fonts`;

const SHELL_URLS = [
  "/vault",
  "/notes",
  "/totp",
  "/security",
  "/trash",
  "/settings",
  "/unlock",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // A single failure (say, a route that needs auth) shouldn't abort the
      // whole install, so each URL is added independently.
      Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !name.startsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isFont(url) {
  return (
    url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"
  );
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".woff2"))
  );
}

/** Cache-first, because hashed assets never change under the same URL. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    cache.put(request, response.clone());
  }
  return response;
}

/** Network-first, falling back to the last good copy, then to /offline. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;

    const offline = await cache.match("/offline");
    if (offline) return offline;

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch the API, or anything carrying credentials we'd rather not
  // keep a copy of.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  if (isFont(url)) {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

/** Lets the page tell a waiting worker to take over immediately. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

/*
 * WZRD public landing service worker.
 *
 * This deliberately caches only the anonymous Creator OS shell. Authenticated
 * Studio/editor routes, API responses, uploads, and user media bypass the
 * worker entirely so they cannot be persisted by this public cache.
 */
const CACHE_NAME = "wzrd-public-shell-v3";
const OFFLINE_DOCUMENT = "/offline.html";
const PUBLIC_LANDING_DOCUMENTS = new Set([
  "/",
]);
const PUBLIC_STATIC_PREFIXES = ["/_next/static/", "/brand/", "/creator-os/"];
const PUBLIC_STATIC_FILES = new Set(["/favicon.ico", "/manifest.webmanifest"]);
const PRECACHE_URLS = [
  OFFLINE_DOCUMENT,
  "/creator-os/fx.js",
  "/creator-os/gl-matrix-min.js",
  "/creator-os/wzrd-wordmark-1600.png",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/brand/wzrd-icon-16.png",
  "/brand/wzrd-icon-32.png",
  "/brand/wzrd-icon-48.png",
  "/brand/wzrd-icon-180.png",
  "/brand/wzrd-icon-192.png",
  "/brand/wzrd-icon-512.png",
  "/brand/wzrd-icon-maskable-512.png",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isPublicLandingDocument(request, url) {
  return request.mode === "navigate" && PUBLIC_LANDING_DOCUMENTS.has(url.pathname);
}

function isPublicStaticAsset(request, url) {
  if (request.headers.has("range")) {
    return false;
  }

  return (
    PUBLIC_STATIC_FILES.has(url.pathname) ||
    PUBLIC_STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

async function putInPublicCache(request, response) {
  if (!response || !response.ok || response.type === "opaque") {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    return await putInPublicCache(request, response);
  } catch {
    const cached = await caches.match(request);
    return cached || fallback();
  }
}

async function navigationNetworkOnly(request) {
  try {
    // Never persist a Next document response. A cached document can reference
    // a prior build's client chunks after a deployment, which is exactly the
    // failure mode a public landing must avoid.
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_DOCUMENT);
    return offline || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    // Cache only the purpose-built offline document and identity assets. The
    // live Next document stays network-only, so a deploy cannot strand a
    // returning visitor on an incompatible client bundle.
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Do not call skipWaiting(): a new worker activates after existing sessions
// close, avoiding surprise reloads while someone is working in Studio.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("wzrd-public-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return;
  }

  if (isPublicLandingDocument(request, url)) {
    event.respondWith(navigationNetworkOnly(request));
    return;
  }

  if (isPublicStaticAsset(request, url)) {
    event.respondWith(networkFirst(request, () => Response.error()));
  }
});

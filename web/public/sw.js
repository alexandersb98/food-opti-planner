// The service worker: keeps the app's own files on the device so a
// home-screen launch paints at once, even while the server (Cloud Run,
// scaled to zero) is still starting. Only the app shell and static files
// are cached; /api is never touched, so data is always the server's.
//
//   page loads (navigations)  the cached index.html at once, refreshed from
//                             the server in the background for next launch
//   /assets/* (hashed names)  from the cache, else the network; a name never
//                             changes content, so no refresh is needed
//   other files (icons, …)    the cached copy at once, refreshed behind it
//
// Bump VERSION to drop every cache on the next visit.

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const STATIC = `static-${VERSION}`
const SHELL_KEY = '/'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(cacheShell())
})

// The page that installs the worker loaded its files before the worker ran,
// so none went through the cache: take index.html and the bundles it names.
async function cacheShell() {
  const response = await fetch(SHELL_KEY)
  if (!response.ok) return
  const html = await response.clone().text()
  await (await caches.open(SHELL)).put(SHELL_KEY, response)
  const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])]
  await (await caches.open(STATIC)).addAll(assets)
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL && key !== STATIC).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return
  if (url.pathname === '/sw.js') return

  if (request.mode === 'navigate') {
    // Every app path is the same index.html, so one entry serves them all.
    event.respondWith(staleWhileRevalidate(event, SHELL, SHELL_KEY, request))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(staleWhileRevalidate(event, STATIC, request, request))
  }
})

async function staleWhileRevalidate(event, cacheName, key, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(key)
  const fresh = fetch(request).then((response) => {
    if (response.ok && !response.redirected) void cache.put(key, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(fresh.catch(() => {})) // offline or asleep: keep the copy
    return cached
  }
  return fresh
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) void cache.put(request, response.clone())
  return response
}

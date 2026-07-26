// saas/public/provider-hub-sw.js
const CACHE_NAME = 'signalboost-provider-hub-v1'
const OFFLINE_URL = '/provider-hub-offline.html'
const PRECACHE = [OFFLINE_URL, '/provider-hub.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.mode !== 'navigate') return
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/dashboard/provider-hub')) return
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
})

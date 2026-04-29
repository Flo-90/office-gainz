const BUILD_ID = new URL(self.location.href).searchParams.get('build') ?? 'v1'
const CACHE_NAME = `officegainz-static-${BUILD_ID}`
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse
          }

          const responseClone = networkResponse.clone()
          const isSameOrigin = new URL(request.url).origin === self.location.origin

          if (isSameOrigin) {
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, responseClone))
          }

          return networkResponse
        })
        .catch(() => caches.match(request))
    }),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = {
        body: event.data.text(),
      }
    }
  }

  const title = payload.title ?? 'OfficeGainz'
  const options = {
    body: payload.body ?? 'The leaderboard moved. Time to jump back in.',
    icon: payload.icon ?? '/pwa-192x192.png',
    badge: payload.badge ?? '/pwa-192x192.png',
    tag: payload.tag ?? 'officegainz-push',
    data: {
      url: payload.url ?? '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url ?? '/',
    self.location.origin,
  ).toString()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (clients) => {
        for (const client of clients) {
          if ('focus' in client && 'navigate' in client) {
            return client.navigate(targetUrl).then(() => client.focus())
          }
        }

        return self.clients.openWindow(targetUrl)
      },
    ),
  )
})
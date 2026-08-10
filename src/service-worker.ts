/// <reference lib="webworker" />
// Custom SW for rest-timer notifications. vite-plugin-pwa runs injectManifest:
// it rewrites `sw.__WB_MANIFEST` into the precache list built from globPatterns
// in vite.config.ts. Precaching + wasm caching are handled inline via the native
// Cache API (no workbox runtime import, zero extra deps).
//
// Security posture mirrors the audited generateSW flags:
//   - no self.clients.claim()  → stale SW never hijacks a live tab
//   - no self.skipWaiting()    → refresh stays via the registerSW prompt (CSP)
//   - stale caches evicted on activate
//
// tsconfig.app.json type-checks src/ under lib DOM, so the global `self` is
// `Window`; alias it to the worker scope the SW actually runs in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sw = (self as any) as ServiceWorkerGlobalScope
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRECACHE_MANIFEST = ((self as any).__WB_MANIFEST ?? []) as Array<{ url: string; revision?: string }>
const PRECACHE_URLS = PRECACHE_MANIFEST.map((e) => e.url)
const CACHE_NAME = 'precache-v1'

// Precache entries may be relative or rooted (e.g. "assets/x.js" or "/x.js");
// normalize to a pathname for fetch matching.
const PRECACHE_PATHS = PRECACHE_URLS.map((u) =>
  u.startsWith('http') ? new URL(u).pathname : u.startsWith('/') ? u : `/${u}`,
)

sw.addEventListener('install', (event: ExtendableEvent) => {
  if (!PRECACHE_URLS.length) return
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
})

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  )
})

sw.addEventListener('fetch', (event: FetchEvent) => {
  const path = new URL(event.request.url).pathname
  if (!PRECACHE_PATHS.includes(path)) return
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      await cache.put(event.request, response.clone())
      return response
    }),
  )
})

// ── rest-timer notification scheduler ───────────────────────────────────────
// Timers are keyed by id so a rest phase can carry several notifications that
// share a tag (nudge / warning / critical). `cancel(tag)` drops every pending
// timer for that tag; a new `schedule` does not evict same-tag timers.
const timers = new Map<ReturnType<typeof setTimeout>, string>()

function fire(tag: string, title: string, body: string) {
  sw.registration?.showNotification(title, { body, tag, requireInteraction: false }).catch(() => {})
}

function arm(tag: string, fireAt: number, title: string, body: string) {
  const delay = fireAt - Date.now()
  if (delay <= 0) {
    fire(tag, title, body)
    return
  }
  const handle = setTimeout(() => fire(tag, title, body), delay)
  timers.set(handle, tag)
}

function cancel(tag: string) {
  for (const [handle, t] of timers) {
    if (t === tag) {
      clearTimeout(handle)
      timers.delete(handle)
    }
  }
}

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data as
    | { type: 'schedule'; tag: string; fireAt: number; title: string; body: string }
    | { type: 'cancel'; tag: string }
    | undefined
  if (!msg || typeof msg.type !== 'string') return
  if (msg.type === 'schedule' && 'fireAt' in msg && 'title' in msg && 'body' in msg) {
    arm(msg.tag, msg.fireAt, msg.title, msg.body)
  } else if (msg.type === 'cancel') {
    cancel(msg.tag)
  }
})

sw.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  event.waitUntil(
    sw.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = client as any as WindowClient
          if (w.focus) return w.focus()
        }
        return sw.clients.openWindow('/')
      }),
  )
})

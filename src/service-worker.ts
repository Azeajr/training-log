/// <reference lib="webworker" />
import { createNotifyTimers } from './lib/notify-timers'
// Custom SW for rest-timer notifications. vite-plugin-pwa runs injectManifest:
// it rewrites `sw.__WB_MANIFEST` into the precache list built from globPatterns
// in vite.config.ts. Precaching + wasm caching are handled inline via the native
// Cache API (no workbox runtime import, zero extra deps).
//
// Security posture mirrors the audited generateSW flags:
//   - no self.clients.claim()  → stale SW never hijacks a live tab
//   - no self.skipWaiting()    → refresh stays via the registerSW prompt (CSP)
//   - stale precache caches evicted on activate (precache- prefix only, so a
//     future feature cache is never wiped)
//
// Fetch: navigations are network-first with the precached shell as offline
// fallback (cold offline launch of /, /workout, … renders index.html instead
// of a dead page); precache paths are cache-first.
//
// Notification schedule from the page is best-effort here — see
// COMMON_MISTAKES #11: a SW's own setTimeout does not keep the worker alive,
// so the page runs the reliable timers and this SW mirrors them.
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
        Promise.all(
          keys
            .filter((key) => key.startsWith('precache-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  )
})

sw.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request
  if (req.method !== 'GET') return
  const path = new URL(req.url).pathname

  // Navigations: network-first, precached shell as offline fallback. Offline
  // cold launches of /, /workout, … render index.html instead of a dead page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', response.clone()))
          return response
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? Response.error())),
    )
    return
  }

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
// Mirrors the page scheduler (src/lib/notify-timers.ts): timers keyed per
// handle, tag-scoped cancel. Best-effort by design — the page owns the
// reliable path. `cancel(tag)` drops every pending timer for that tag; a new
// `schedule` does not evict same-tag timers (a rest phase can carry several
// notifications that share a tag — nudge / warning / critical).

const notifyTimers = createNotifyTimers({
  fire: (target) => {
    sw.registration
      ?.showNotification(target.title, { body: target.body, tag: target.tag, requireInteraction: false })
      .catch(() => {})
  },
})

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data as
    | { type: 'schedule'; tag: string; fireAt: number; title: string; body: string }
    | { type: 'cancel'; tag: string }
    | undefined
  if (!msg || typeof msg.type !== 'string') return
  if (
    msg.type === 'schedule' &&
    typeof msg.tag === 'string' &&
    typeof msg.fireAt === 'number' &&
    typeof msg.title === 'string' &&
    typeof msg.body === 'string'
  ) {
    notifyTimers.arm({ tag: msg.tag, fireAt: msg.fireAt, title: msg.title, body: msg.body })
  } else if (msg.type === 'cancel' && typeof msg.tag === 'string') {
    notifyTimers.cancelTag(msg.tag)
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
/// <reference lib="webworker" />
import { createNotifyTimers } from './lib/notify-timers'
import { dedupePrecacheUrls, toPrecachePaths, type PrecacheEntry } from './lib/precache'
import { swTrace } from './lib/trace-sw-store'
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
const PRECACHE_MANIFEST = ((self as any).__WB_MANIFEST ?? []) as PrecacheEntry[]
// Deduplicated: `cache.addAll()` rejects with InvalidStateError on a repeated
// URL, and the injected manifest can repeat one — see lib/precache.ts for what
// that cost when it happened.
const PRECACHE_URLS = dedupePrecacheUrls(PRECACHE_MANIFEST)
const CACHE_NAME = 'precache-v1'

const PRECACHE_PATHS = toPrecachePaths(PRECACHE_URLS)

// Top level, so it runs on every script EVALUATION. That is the record worth
// having: a second boot means the browser terminated the first worker, taking
// its pending setTimeouts with it, and nothing else in the system says so.
swTrace('sw.boot', {})

sw.addEventListener('install', (event: ExtendableEvent) => {
  swTrace('sw.install', { urls: PRECACHE_URLS.length })
  if (!PRECACHE_URLS.length) return
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
})

sw.addEventListener('activate', (event: ExtendableEvent) => {
  swTrace('sw.activate', {})
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
          // Clone SYNCHRONOUSLY. `return response` below hands this body to the
          // navigation, and a clone taken after that throws "body is already
          // used" — which is what made the previous `caches.open(...).then(c =>
          // c.put(..., response.clone()))` a silent no-op: the clone ran inside
          // the async callback, always too late, and `void` discarded the
          // rejection. The shell was therefore frozen at whatever `install`
          // precached and this refresh never ran once.
          //
          // Only a good shell may replace a good shell. `fetch` rejects only on
          // a NETWORK failure, so a 503/502/500/404 or a host's maintenance page
          // all resolve here; caching one would poison the offline fallback
          // below until the next successful navigation.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)))
          }
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
      // Same gate, and it matters more here: this branch is cache-first, so a
      // bad response is not merely stored, it is never re-fetched.
      if (response.ok && response.type === 'basic') await cache.put(event.request, response.clone())
      return response
    }),
  )
})

// ── rest-timer notification scheduler ───────────────────────────────────────
// Mirrors the page scheduler (src/lib/notify-timers.ts): timers keyed per
// handle, tag-scoped cancel. Best-effort by design — the page owns the
// reliable path. `cancel(tag)` drops every pending timer for that tag; a new
// `schedule` does not evict same-tag timers (a completed-set rest carries both
// the first and second bell under the same tag).

const notifyTimers = createNotifyTimers({
  fire: (target) => {
    sw.registration
      ?.showNotification(target.title, { body: target.body, tag: target.tag, requireInteraction: false })
      .then(() => swTrace('sw.shown', { tag: target.tag }))
      .catch((err: unknown) => swTrace('sw.show.failed', { tag: target.tag, error: String(err) }))
  },
  trace: (ev, d) => swTrace(ev, d),
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
    swTrace('sw.msg.schedule', { tag: msg.tag, fireAt: msg.fireAt, in: msg.fireAt - Date.now() })
    notifyTimers.arm({ tag: msg.tag, fireAt: msg.fireAt, title: msg.title, body: msg.body })
  } else if (msg.type === 'cancel' && typeof msg.tag === 'string') {
    swTrace('sw.msg.cancel', { tag: msg.tag })
    notifyTimers.cancelTag(msg.tag)
  }
})

sw.addEventListener('notificationclick', (event: NotificationEvent) => {
  // Proof of delivery, and the only kind this platform offers: a notification
  // cannot be clicked unless it was actually shown.
  swTrace('sw.click', { tag: event.notification.tag })
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

/// <reference lib="webworker" />
import { createNotifyTimers } from './lib/notify-timers'
import { dedupePrecacheUrls, precacheVersion, toPrecachePaths, type PrecacheEntry } from './lib/precache'
// Custom SW for rest-timer notifications. vite-plugin-pwa runs injectManifest:
// it rewrites `sw.__WB_MANIFEST` into the precache list built from globPatterns
// in vite.config.ts. Precaching + wasm caching are handled inline via the native
// Cache API (no workbox runtime import, zero extra deps).
//
// Lifecycle:
//   - no self.clients.claim()  → a new SW never takes over a live tab
//   - skipWaiting() only on the page's SKIP_WAITING message, which it sends
//     when the user takes an update (lib/sw-update.ts); the page reloads on
//     the controller change, so it never runs on under another deploy's SW
//   - one cache per deploy, named from the precache list; activate deletes
//     the other `precache-` caches (prefix only, so a future feature cache is
//     never wiped)
//
// Fetch: navigations get THIS worker's precached shell, never the network's
// (cold offline launch of /, /workout, … renders index.html instead of a dead
// page, and the shell always matches the assets this worker serves); precache
// paths are cache-first.
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
// Per deploy (lib/precache.ts says what the constant `precache-v1` cost).
const CACHE_NAME = `precache-${precacheVersion(PRECACHE_MANIFEST)}`

const PRECACHE_PATHS = toPrecachePaths(PRECACHE_URLS)

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

  // Navigations: this worker's own shell, from this worker's own cache. Never
  // the network's. This was network-first, writing each shell it fetched into
  // the cache, and a shell from the network can belong to a newer deploy than
  // the worker serving it: the app opened online after a deploy ran the new
  // page under the old worker, which does not serve the new page's scripts, so
  // screens not yet opened would not load offline; and if the new worker's
  // install failed, the cached shell named scripts no cache held and an
  // offline launch never got past LOADING (hardening legs I and J). A new
  // deploy now reaches the page through the update hand-off instead.
  //
  // The network is only for a shell missing from the cache, and nothing it
  // returns is stored: the cache holds what `install` put there, so a 503 or a
  // maintenance page can never become the offline shell either.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match('/index.html'))
        .then((hit) => {
          if (!hit) return fetch(req)
          // Pages redirects /index.html to /. Cache API keeps the followed
          // redirect flag, which a navigation (redirect mode "manual") cannot
          // accept: Safari reports "Response served by service worker has
          // redirections". Copy this worker's cached shell to clear that flag,
          // retaining its body and headers, including CSP. Do this on read so
          // it also handles shells already cached by the previous worker.
          return hit.redirected
            ? new Response(hit.body, {
                status: hit.status,
                statusText: hit.statusText,
                headers: hit.headers,
              })
            : hit
        }),
    )
    return
  }

  if (!PRECACHE_PATHS.includes(path)) return
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      // Only a good response is stored. `fetch` rejects only on a network
      // failure, so a 502 or a host's error page resolves here, and this branch
      // is cache-first: anything stored is never re-fetched (hardening leg G).
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
      .catch(() => {})
  },
})

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data as
    | { type: 'schedule'; tag: string; fireAt: number; title: string; body: string }
    | { type: 'cancel'; tag: string }
    | { type: 'SKIP_WAITING' }
    | undefined
  if (!msg || typeof msg.type !== 'string') return
  // The user took the update (lib/sw-update.ts). Only a waiting worker acts on
  // it; for the active one skipWaiting() does nothing.
  if (msg.type === 'SKIP_WAITING') {
    void sw.skipWaiting()
    return
  }
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

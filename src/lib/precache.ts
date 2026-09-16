/**
 * The service worker's precache list, as data.
 *
 * Pure list handling, lifted out of `service-worker.ts` so it can be tested
 * without a worker scope. The SW itself is covered only by
 * `scripts/verify-notify-hardening.js`, which drives a real browser against a
 * production build — thorough, but it takes half a minute and it tells you the
 * service worker failed to install, not why.
 */

export interface PrecacheEntry {
  url: string
  revision?: string
}

/**
 * The URLs to precache, with duplicates removed.
 *
 * `cache.addAll()` rejects outright with `InvalidStateError` when its request
 * list contains the same URL twice, and the injected manifest can contain
 * duplicates through no fault of its own: vite-plugin-pwa adds the web app
 * manifest's icons to the precache list, so an icon that ALSO matches
 * `globPatterns` is listed once from each source.
 *
 * The cost of not handling it is out of all proportion to the cause. Adding
 * `svg` to `globPatterns` so favicon.svg would be available offline (F72) put
 * three icons in the list twice, `addAll` rejected, and the service worker
 * failed to install — so no page was controlled, the offline shell stopped
 * existing, and all seven hardening legs went red at once. One repeated entry
 * should not be able to do that.
 */
export const dedupePrecacheUrls = (entries: readonly PrecacheEntry[]): string[] =>
  [...new Set(entries.map(e => e.url))]

/**
 * Precache entries as pathnames, for matching against a request.
 *
 * Entries arrive relative or rooted depending on where they came from
 * ("assets/x.js", "/x.js", or an absolute URL), and the fetch handler compares
 * them to `new URL(request.url).pathname`.
 */
export const toPrecachePaths = (urls: readonly string[]): string[] =>
  urls.map(u =>
    u.startsWith('http') ? new URL(u).pathname : u.startsWith('/') ? u : `/${u}`,
  )

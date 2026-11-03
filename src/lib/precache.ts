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
  // null for a file whose URL already carries a content hash.
  revision?: string | null
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

/**
 * A short name for one deploy's precache list, used as its cache name.
 *
 * A deploy changes the list — hashed asset URLs, or the revision of an unhashed
 * file like index.html — so it changes the name, and each deploy installs into
 * a cache of its own. The name used to be the constant `precache-v1`: every
 * deploy installed into the cache the previous one was still serving, and the
 * activate cleanup that deletes other `precache-` caches never had anything to
 * delete, so every deploy's assets piled up for good.
 *
 * Order-independent, so a build that lists the same files in another order
 * does not throw away a cache that is still correct. FNV-1a: this only has to
 * tell deploys apart, not resist anyone.
 */
export const precacheVersion = (entries: readonly PrecacheEntry[]): string => {
  const text = entries
    .map(e => `${e.url} ${e.revision ?? ''}`)
    .sort()
    .join('\n')
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

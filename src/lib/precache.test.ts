import { describe, it, expect } from 'vitest'
import { dedupePrecacheUrls, toPrecachePaths } from './precache'

// `cache.addAll()` rejects with InvalidStateError on a repeated URL, and the
// injected manifest can repeat one: vite-plugin-pwa adds the web app manifest's
// icons to the precache list, so an icon that also matches `globPatterns` is
// listed once from each source. Adding `svg` to those patterns (F72) put three
// icons in twice — and the service worker then failed to INSTALL, so no page
// was controlled, the offline shell stopped existing, and all seven hardening
// legs went red at once. That is a wildly disproportionate consequence for a
// repeated string, which is why it is handled here rather than avoided upstream.
describe('dedupePrecacheUrls', () => {
  it('collapses a URL listed by both globPatterns and the manifest icons', () => {
    expect(dedupePrecacheUrls([
      { url: 'index.html', revision: 'a' },
      { url: 'favicon.svg', revision: 'b' },
      { url: 'icon-192.png', revision: 'c' },
      { url: 'favicon.svg', revision: 'b' },
      { url: 'icon-192.png', revision: 'c' },
    ])).toEqual(['index.html', 'favicon.svg', 'icon-192.png'])
  })

  it('keeps first-seen order, so the shell is still cached first', () => {
    expect(dedupePrecacheUrls([
      { url: 'index.html' }, { url: 'a.js' }, { url: 'index.html' }, { url: 'b.js' },
    ])).toEqual(['index.html', 'a.js', 'b.js'])
  })

  it('collapses entries that differ only by revision', () => {
    // Same URL, two revisions: still one request, so still an addAll rejection.
    expect(dedupePrecacheUrls([
      { url: 'favicon.svg', revision: 'one' },
      { url: 'favicon.svg', revision: 'two' },
    ])).toEqual(['favicon.svg'])
  })

  it('leaves a list with no duplicates untouched', () => {
    const urls = [{ url: 'index.html' }, { url: 'assets/a.js' }, { url: 'assets/b.css' }]
    expect(dedupePrecacheUrls(urls)).toEqual(['index.html', 'assets/a.js', 'assets/b.css'])
  })

  it('handles an empty manifest', () => {
    expect(dedupePrecacheUrls([])).toEqual([])
  })
})

describe('toPrecachePaths', () => {
  it('roots a relative entry so it matches a request pathname', () => {
    expect(toPrecachePaths(['index.html', 'assets/a.js'])).toEqual(['/index.html', '/assets/a.js'])
  })

  it('leaves an already-rooted entry alone', () => {
    expect(toPrecachePaths(['/index.html'])).toEqual(['/index.html'])
  })

  it('reduces an absolute URL to its pathname', () => {
    expect(toPrecachePaths(['https://example.com/assets/a.js'])).toEqual(['/assets/a.js'])
  })

  it('keeps the three forms distinguishable from one another', () => {
    expect(toPrecachePaths(['a.js', '/a.js', 'https://example.com/a.js']))
      .toEqual(['/a.js', '/a.js', '/a.js'])
  })
})

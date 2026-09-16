// The web app manifest, as data.
//
// Lifted out of vite.config.ts so it can be asserted against the filesystem.
// It named `icon-192.png` and `icon-512.png` for the whole life of the project
// with no files behind them, which meant Chrome's installability criteria — a
// manifest icon of at least 144×144 that actually loads — were never met and
// the install prompt never appeared. The build succeeded and CI passed the
// entire time, because nothing ever checked that a declared icon existed (F70).
//
// `manifest-icons.test.ts` is that check.

export interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

/**
 * Icons that must exist as files in `public/`.
 *
 * `any maskable` on both PNGs: the mark sits inside the maskable safe circle
 * (see the geometry note in public/favicon.svg), so it needs no separately
 * cropped variant. The SVG trails them for browsers that would rather scale it.
 */
export const PWA_ICONS: ManifestIcon[] = [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
]

/**
 * Referenced from index.html rather than the manifest: iOS ignores the
 * manifest's icons for the home screen and reads this link instead, so without
 * it an installed app had no icon at all.
 */
export const APPLE_TOUCH_ICON = 'apple-touch-icon.png'

export const PWA_MANIFEST = {
  name: 'Training Log',
  short_name: 'Training',
  theme_color: '#000000',
  background_color: '#09090b',
  display: 'standalone' as const,
  icons: PWA_ICONS,
}

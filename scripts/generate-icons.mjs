// Rasterize public/favicon.svg into the PNG icons the manifest and iOS need.
//
// The manifest named icon-192.png and icon-512.png and neither file existed, so
// Chrome's installability criteria were never met and the install prompt simply
// never appeared — on an app whose stated distribution is an installed
// offline-first PWA. index.html had no apple-touch-icon either, so the iOS
// home-screen path had no icon at all (F70).
//
// The PNGs are committed rather than produced at build time: that keeps CI and
// the deploy free of an image toolchain, and the icons change about once a
// project. Run this after editing favicon.svg.
//
//   node scripts/generate-icons.mjs
//
// Playwright's bundled Chromium does the rasterizing — already a devDependency
// for the E2E suite, so this needs nothing installed that the repo does not
// already require, and it renders the SVG exactly as a browser will.

import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

// apple-touch-icon is 180: iOS scales anything else, and a 180 source is what
// every current device asks for.
const SIZES = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

const svg = await readFile(join(publicDir, 'favicon.svg'), 'utf8')

const browser = await chromium.launch()
try {
  for (const { file, size } of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    // The SVG is inlined rather than loaded over file:// so the render cannot
    // silently fall back to a broken-image box; margin:0 keeps the mark flush
    // to the viewport, which is what makes the screenshot exactly `size` square.
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0;background:#000}
       svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'load' },
    )
    const png = await page.screenshot({ omitBackground: false })
    await writeFile(join(publicDir, file), png)
    await page.close()
    console.log(`wrote public/${file} (${size}×${size}, ${png.length} bytes)`)
  }
} finally {
  await browser.close()
}

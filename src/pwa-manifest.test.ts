import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PWA_ICONS, APPLE_TOUCH_ICON, PWA_MANIFEST } from './pwa-manifest'

const root = join(import.meta.dirname, '..')
const publicFile = (name: string) => join(root, 'public', name)

// ── F70 ─────────────────────────────────────────────────────────────────────
// The manifest declared icon-192.png and icon-512.png and neither file existed.
// Chrome's installability criteria want a manifest icon of at least 144×144
// that actually loads, so the install prompt never appeared — on an app whose
// stated distribution is an installed offline-first PWA, and whose README
// promises "installable, works offline". The build succeeded and CI passed the
// whole time, because nothing held the declaration against the filesystem.
describe('every declared icon exists (F70)', () => {
  it.each(PWA_ICONS.map(i => i.src))('%s is a real file in public/', src => {
    expect(existsSync(publicFile(src))).toBe(true)
    expect(statSync(publicFile(src)).size).toBeGreaterThan(0)
  })

  it('ships an icon big enough for Chrome to offer the install', () => {
    const installable = PWA_ICONS.filter(i => {
      const [w] = i.sizes.split('x').map(Number)
      return Number.isFinite(w) && w >= 144
    })
    expect(installable.length).toBeGreaterThan(0)
    for (const i of installable) expect(existsSync(publicFile(i.src))).toBe(true)
  })

  it('has a maskable icon, so an installed launcher does not letterbox it', () => {
    expect(PWA_ICONS.some(i => i.purpose?.includes('maskable'))).toBe(true)
  })

  it('declares the sizes the PNGs actually are', () => {
    // A PNG's IHDR puts width and height at bytes 16-23, big-endian. Reading it
    // directly keeps the manifest honest without an image dependency: a
    // regenerated icon at the wrong size would otherwise still "exist".
    for (const icon of PWA_ICONS.filter(i => i.type === 'image/png')) {
      const buf = readFileSync(publicFile(icon.src))
      const [declared] = icon.sizes.split('x').map(Number)
      expect(buf.readUInt32BE(16)).toBe(declared)
      expect(buf.readUInt32BE(20)).toBe(declared)
    }
  })
})

describe('index.html icon links (F70)', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8')

  it('links an apple-touch-icon, which iOS reads instead of the manifest', () => {
    expect(html).toMatch(/rel="apple-touch-icon"/)
    expect(html).toMatch(new RegExp(`href="/${APPLE_TOUCH_ICON}"`))
    expect(existsSync(publicFile(APPLE_TOUCH_ICON))).toBe(true)
  })

  it('links a favicon that exists', () => {
    const href = /<link rel="icon"[^>]*href="\/([^"]+)"/.exec(html)?.[1]
    expect(href).toBeDefined()
    expect(existsSync(publicFile(href!))).toBe(true)
  })
})

// ── F81 ─────────────────────────────────────────────────────────────────────
// The icon set was scaffold left over from another project: a social-link
// sprite (bluesky, discord, github, x) and a favicon drawn in purple and blue,
// against an app whose tokens are #4ade80 on #000000.
describe('the icon is this app’s (F81)', () => {
  const svg = readFileSync(publicFile('favicon.svg'), 'utf8')
  const css = readFileSync(join(root, 'src', 'index.css'), 'utf8')

  const token = (name: string) =>
    new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase()

  it('is drawn in the app’s own accent and background tokens', () => {
    const colours = [...svg.matchAll(/#[0-9a-fA-F]{6}/g)].map(m => m[0].toLowerCase())
    expect(new global.Set(colours)).toEqual(new global.Set([token('accent'), token('bg')]))
  })

  it('does not ship the orphaned social sprite', () => {
    expect(existsSync(publicFile('icons.svg'))).toBe(false)
  })
})

describe('manifest basics', () => {
  it('keeps the standalone display the install flow depends on', () => {
    expect(PWA_MANIFEST.display).toBe('standalone')
    expect(PWA_MANIFEST.name).toBeTruthy()
    expect(PWA_MANIFEST.short_name).toBeTruthy()
  })
})

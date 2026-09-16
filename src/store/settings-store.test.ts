// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { db } from '../db/index'
import { applyTheme, loadSettings, updateSettings, settings, THEMES, DEFAULT_BAR_WEIGHT, DEFAULT_PLATES, SETTINGS_DEFAULTS } from './settings-store'

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

beforeEach(async () => {
  await db.settings.clear()
  // reset CSS vars between tests
  for (const prop of Object.keys(THEMES.oled.vars)) {
    document.documentElement.style.removeProperty(prop)
  }
})

afterEach(drain)

// ─── applyTheme ───────────────────────────────────────────────────────────────

describe('applyTheme', () => {
  it('provides a pure-black OLED theme with readable secondary text', () => {
    applyTheme('oled')
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe('#000000')
    expect(document.documentElement.style.getPropertyValue('--color-muted')).toBe('#a3a3a3')
    expect(document.documentElement.style.getPropertyValue('--color-faint')).toBe('#737373')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('migrates the retired dark theme to OLED', () => {
    applyTheme('dark')
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe(THEMES.oled.vars['--color-bg'])
  })

  it('provides a high-contrast light OLED theme', () => {
    applyTheme('oled-light')
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe('#ffffff')
    expect(document.documentElement.style.getPropertyValue('--color-text')).toBe('#0a0a0a')
  })

  it('sets colorScheme on documentElement', () => {
    applyTheme('oled-light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    applyTheme('oled')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('falls back to OLED for unknown key', () => {
    applyTheme('nonexistent')
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe(THEMES.oled.vars['--color-bg'])
  })
})

// ─── loadSettings ─────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('preserves defaults when no settings row exists', async () => {
    await loadSettings()
    expect(settings.restTimer1).toBe(90)
  })

  it('updates the store and applies theme when a row exists', async () => {
    await db.settings.add({
      restTimer1: 60,
      restTimer2: 120,
      restTimerFail: 240,
      theme: 'light',
      barWeight: 35,
      plates: [{ weight: 45, count: 2 }],
    })
    await loadSettings()
    expect(settings.restTimer1).toBe(60)
    expect(settings.restTimer2).toBe(120)
    expect(settings.restTimerFail).toBe(240)
    expect(settings.theme).toBe('oled-light')
    expect(settings.barWeight).toBe(35)
  })

  it('uses defaults for barWeight and plates when row has none', async () => {
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300 })
    await loadSettings()
    expect(settings.barWeight).toBe(DEFAULT_BAR_WEIGHT)
    expect(settings.plates).toEqual(DEFAULT_PLATES)
  })
})

// ─── updateSettings ───────────────────────────────────────────────────────────

describe('updateSettings', () => {
  async function seedSettings() {
    return db.settings.add({
      restTimer1: 90,
      restTimer2: 180,
      restTimerFail: 300,
      theme: 'dark',
      barWeight: DEFAULT_BAR_WEIGHT,
      plates: DEFAULT_PLATES,
    })
  }

  it('persists changes to DB', async () => {
    await seedSettings()
    await updateSettings({ restTimer1: 60 })
    const row = await db.settings.toCollection().first()
    expect(row?.restTimer1).toBe(60)
  })

  it('updates the in-memory store', async () => {
    await seedSettings()
    await updateSettings({ restTimer2: 120 })
    expect(settings.restTimer2).toBe(120)
  })

  it('applies theme when theme key is updated', async () => {
    await seedSettings()
    await updateSettings({ theme: 'oled-light' })
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe(THEMES['oled-light'].vars['--color-accent'])
  })

  it('inserts defaults when no settings row exists in DB', async () => {
    await updateSettings({ restTimer1: 60 })
    const row = await db.settings.toCollection().first()
    expect(row).toBeDefined()
    expect(row!.restTimer1).toBe(60)
    expect(row!.restTimer2).toBe(SETTINGS_DEFAULTS.restTimer2)
    expect(row!.supplementalTemplate).toBe(SETTINGS_DEFAULTS.supplementalTemplate)
  })
})

// ── F11 ─────────────────────────────────────────────────────────────────────
// loadSettings returned early when there was no settings row, so an import
// carrying no settings table left the PREVIOUS install's values live in memory
// — bar weight, plates, cycle shape, supplemental template — over a database
// that had none of them, until something happened to reload the page. And a
// restored theme was written into the store without ever being painted.
describe('loadSettings with no stored row (F11)', () => {
  it('follows the database down to defaults instead of keeping stale values', async () => {
    await updateSettings({ barWeight: 15, hasDeloadWeek: false, supplementalTemplate: 'bbs' })
    expect(settings.barWeight).toBe(15)

    // What a destructive import with no settings table leaves behind.
    await db.settings.clear()
    await loadSettings()

    expect(settings.barWeight).toBe(SETTINGS_DEFAULTS.barWeight)
    expect(settings.hasDeloadWeek).toBe(SETTINGS_DEFAULTS.hasDeloadWeek)
    expect(settings.supplementalTemplate).toBe(SETTINGS_DEFAULTS.supplementalTemplate)
  })

  it('repaints the theme, so the screen is not left on the old palette', async () => {
    const otherKey = (Object.keys(THEMES) as Array<keyof typeof THEMES>)
      .find(k => k !== SETTINGS_DEFAULTS.theme)!
    await updateSettings({ theme: otherKey })
    const swapped = document.documentElement.style.getPropertyValue('--color-accent')

    await db.settings.clear()
    await loadSettings()

    expect(settings.theme).toBe(SETTINGS_DEFAULTS.theme)
    const painted = document.documentElement.style.getPropertyValue('--color-accent')
    expect(painted).toBe(THEMES[SETTINGS_DEFAULTS.theme].vars['--color-accent'])
    expect(painted).not.toBe(swapped)
  })
})

describe('loadSettings with a stored row (F11)', () => {
  it('paints the restored theme rather than only recording it', async () => {
    const otherKey = (Object.keys(THEMES) as Array<keyof typeof THEMES>)
      .find(k => k !== SETTINGS_DEFAULTS.theme)!
    // A row straight from an import: nothing has applied its theme yet.
    await db.settings.clear()
    await db.settings.add({
      restTimer1: 90, restTimer2: 180, restTimerFail: 300,
      theme: otherKey, barWeight: 45, plates: DEFAULT_PLATES,
    })
    applyTheme(SETTINGS_DEFAULTS.theme)

    await loadSettings()

    expect(settings.theme).toBe(otherKey)
    expect(document.documentElement.style.getPropertyValue('--color-accent'))
      .toBe(THEMES[otherKey].vars['--color-accent'])
  })
})

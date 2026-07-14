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

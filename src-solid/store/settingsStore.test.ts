import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/db'
import { settings, loadSettings, updateSettings, applyTheme, THEMES, DEFAULT_PLATES } from './settingsStore'

const SEED = {
  restTimer1: 90,
  restTimer2: 180,
  restTimerFail: 300,
  theme: 'dark',
  barWeight: 45,
  plates: DEFAULT_PLATES,
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('applyTheme', () => {
  it('sets CSS variables for dark theme', () => {
    applyTheme('dark')
    expect(document.documentElement.style.getPropertyValue('--color-bg'))
      .toBe(THEMES.dark.vars['--color-bg'])
  })

  it('sets CSS variables for light theme', () => {
    applyTheme('light')
    expect(document.documentElement.style.getPropertyValue('--color-bg'))
      .toBe(THEMES.light.vars['--color-bg'])
  })

  it('sets CSS variables for dim theme', () => {
    applyTheme('dim')
    expect(document.documentElement.style.getPropertyValue('--color-bg'))
      .toBe(THEMES.dim.vars['--color-bg'])
  })

  it('falls back to dark for unknown theme key', () => {
    applyTheme('nonexistent')
    expect(document.documentElement.style.getPropertyValue('--color-bg'))
      .toBe(THEMES.dark.vars['--color-bg'])
  })

  it('sets colorScheme on documentElement', () => {
    applyTheme('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})

describe('loadSettings', () => {
  it('resolves without error when DB has no settings row', async () => {
    await expect(loadSettings()).resolves.toBeUndefined()
  })

  it('applies theme CSS vars from DB row', async () => {
    await db.settings.add({ ...SEED, theme: 'light' })
    await loadSettings()
    expect(document.documentElement.style.getPropertyValue('--color-bg'))
      .toBe(THEMES.light.vars['--color-bg'])
  })

  it('populates timer values from DB row', async () => {
    await db.settings.add({ ...SEED, restTimer1: 120 })
    await loadSettings()
    expect(settings.restTimer1).toBe(120)
  })

  it('populates barWeight from DB row', async () => {
    await db.settings.add({ ...SEED, barWeight: 35 })
    await loadSettings()
    expect(settings.barWeight).toBe(35)
  })

  it('sets loaded flag', async () => {
    await db.settings.add(SEED)
    await loadSettings()
    expect(settings.loaded).toBe(true)
  })
})

describe('updateSettings', () => {
  it('persists restTimer1 change to DB', async () => {
    await db.settings.add(SEED)
    await updateSettings({ restTimer1: 150 })
    const row = await db.settings.toCollection().first()
    expect(row?.restTimer1).toBe(150)
  })

  it('updates in-memory store', async () => {
    await db.settings.add(SEED)
    await updateSettings({ restTimer2: 240 })
    expect(settings.restTimer2).toBe(240)
  })

  it('applies CSS vars when theme is updated', async () => {
    await db.settings.add(SEED)
    await updateSettings({ theme: 'dim' })
    expect(document.documentElement.style.getPropertyValue('--color-bg'))
      .toBe(THEMES.dim.vars['--color-bg'])
  })

  it('resolves without error when DB has no settings row', async () => {
    await expect(updateSettings({ restTimer1: 150 })).resolves.toBeUndefined()
  })
})

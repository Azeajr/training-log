// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'
import { loadSettings, settings, updateSettings } from '../store/settings-store'

beforeEach(async () => { await __resetForTest() })

// Tests build every database from a fresh SCHEMA, so the migration path is the
// one a green suite never exercises. Rebuild the old shape by dropping the
// column, then add it back the way init() does: every migration, errors
// swallowed, run twice as on a second boot.
describe('cross-lift switch migration', () => {
  it('adds the column to an existing database, which then reads as on', async () => {
    const raw = (sql: string) => db.settings._query(sql, [])
    await raw('ALTER TABLE settings DROP COLUMN crossLiftSupplemental')
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300 })

    for (let boot = 0; boot < 2; boot++) {
      for (const sql of ADDITIVE_MIGRATIONS) {
        try { await raw(sql) } catch { /* already applied, as on app startup */ }
      }
    }

    expect((await db.settings.toArray())[0].crossLiftSupplemental).toBeNull()
    await loadSettings()
    expect(settings.crossLiftSupplemental).toBe(true)

    await updateSettings({ crossLiftSupplemental: false })
    await loadSettings()
    expect(settings.crossLiftSupplemental).toBe(false)
    await updateSettings({ crossLiftSupplemental: true })
  })
})

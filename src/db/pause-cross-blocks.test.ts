// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'
import { loadCrossPlan } from '../lib/lift'

beforeEach(async () => { await __resetForTest() })

// Tests build every database from a fresh SCHEMA, so the migration path is the
// one a green suite never exercises. Rebuild the old shape by dropping the
// column, then add it back the way init() does: every migration, errors
// swallowed, run twice as on a second boot.
describe('paused cross-lift block migration', () => {
  it('adds the column to an existing database, and its blocks keep running', async () => {
    const raw = (sql: string) => db.liftSupplementals._query(sql, [])
    await raw('ALTER TABLE liftSupplementals DROP COLUMN paused')
    const bench = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const ohp = await db.lifts.add({ name: 'OHP', order: 2, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id = await db.liftSupplementals.add({ liftId: bench, movementLiftId: ohp, weightMode: 'fsl', percent: null, sets: 5, reps: 10, order: 0 })

    for (let boot = 0; boot < 2; boot++) {
      for (const sql of ADDITIVE_MIGRATIONS) {
        try { await raw(sql) } catch { /* already applied, as on app startup */ }
      }
    }

    expect((await db.liftSupplementals.get(id))?.paused).toBeNull()
    const plan = await loadCrossPlan(db, bench, 1, { deloadSupplemental: 'normal', barWeight: 45 })
    expect(plan.map(p => p.paused)).toEqual([false])

    await db.liftSupplementals.update(id, { paused: true })
    expect((await db.liftSupplementals.get(id))?.paused).toBe(true)
  })
})

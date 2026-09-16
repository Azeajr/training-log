// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'

beforeEach(async () => { await __resetForTest() })

// ── F94 ─────────────────────────────────────────────────────────────────────
// Cross sets are attributed by their own liftId, so every record reader scans
// `sets` by liftId — including detectPRs, which runs on the logging path after
// each set. There was an index on sessionId but none on liftId, so those became
// full scans that grow with total history.
describe('sets(liftId) is indexed (F94)', () => {
  it('uses an index rather than scanning the table', async () => {
    const plan = (await db.lifts._query(
      'EXPLAIN QUERY PLAN SELECT * FROM sets WHERE liftId = ?', [1],
    )) as unknown as Array<Record<string, unknown>>
    const detail = plan.map(r => String(r.detail ?? '')).join(' ')
    expect(detail).toMatch(/idx_sets_liftId/)
    expect(detail).not.toMatch(/SCAN sets(?! USING)/)
  })

  it('still returns the right rows through the index', async () => {
    const sessionId = await db.sessions.add({
      cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'cross', setNumber: 1, weight: 100, reps: 5, isAmrap: false, liftId: 2 })
    await db.sets.add({ sessionId, type: 'cross', setNumber: 2, weight: 200, reps: 5, isAmrap: false, liftId: 3 })
    const rows = await db.sets.where('liftId').equals(2).toArray()
    expect(rows.map(r => r.weight)).toEqual([100])
  })
})

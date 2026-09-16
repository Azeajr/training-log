// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'
import { importFromRawData } from '../lib/export-import'
import { composeCrossSets } from '../lib/workout-compose'
import { calcCrossSets } from '../lib/calc'

beforeEach(async () => { await __resetForTest() })

const raw = (sql: string) =>
  db.exercises._query(sql, []) as unknown as Promise<Record<string, unknown>[]>

/** Re-run the migrations the way init() does: in order, errors swallowed. */
async function applyMigrations() {
  for (const sql of ADDITIVE_MIGRATIONS) {
    try { await raw(sql) } catch { /* already applied */ }
  }
}

const block = (liftId: number, movementLiftId: number, sets: number, order: number) =>
  db.liftSupplementals.add({
    liftId, movementLiftId, weightMode: 'percent', percent: 0.7, sets, reps: 5, order,
  })

// ── F31 ─────────────────────────────────────────────────────────────────────
// Logged cross sets carry only the movement's liftId, never a block identity,
// so composeCrossSets matches one logged set to EVERY block on that movement.
// LiftSetupModal prevents duplicates by filtering the picker, but that was a UI
// rule with nothing behind it — liftSupplementals had only an index on liftId.
describe('duplicate cross-lift blocks are reconciled (F31)', () => {
  async function withDuplicates() {
    await raw('DROP INDEX IF EXISTS idx_liftSupplementals_lift_movement')
    const first = await block(1, 2, 3, 1)
    await block(1, 2, 3, 2)          // same movement — the duplicate
    await block(1, 3, 3, 3)          // a different movement, untouched
    return first
  }

  it('keeps the first block for a movement and drops the twin', async () => {
    const first = await withDuplicates()
    await applyMigrations()

    const rows = await db.liftSupplementals.toArray()
    expect(rows.map(r => r.id)).toContain(first)
    expect(rows.filter(r => r.movementLiftId === 2)).toHaveLength(1)
    expect(rows.filter(r => r.movementLiftId === 3)).toHaveLength(1)
  })

  it('lets the unique index take once the duplicates are gone', async () => {
    await withDuplicates()
    await applyMigrations()

    const idx = await raw(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_liftSupplementals_lift_movement'",
    )
    expect(idx).toHaveLength(1)
    await expect(block(1, 2, 3, 9)).rejects.toThrow()
  })

  it('still allows the same movement under a different lift', async () => {
    await applyMigrations()
    await block(1, 2, 3, 1)
    await expect(block(4, 2, 3, 1)).resolves.toBeDefined()
  })

  it('is a no-op on a database that was already healthy', async () => {
    await block(1, 2, 3, 1)
    await block(1, 3, 3, 2)
    await applyMigrations()
    expect(await db.liftSupplementals.toArray()).toHaveLength(2)
  })

  it('an imported backup carrying duplicates restores one block, not two', async () => {
    await importFromRawData(db, {
      lifts: [{ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      liftSupplementals: [
        { id: 1, liftId: 1, movementLiftId: 2, weightMode: 'percent', percent: 0.7, sets: 3, reps: 5, order: 1 },
        { id: 2, liftId: 1, movementLiftId: 2, weightMode: 'percent', percent: 0.5, sets: 5, reps: 5, order: 2 },
      ],
    })

    const rows = await db.liftSupplementals.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
  })
})

// The behaviour the index exists to prevent: one logged set marking set 1 of
// two blocks done, and overriding the remainder of both.
describe('one logged set must not drive two blocks (F31)', () => {
  it('composes duplicate-movement blocks wrongly — which is why they cannot exist', () => {
    const plan = (sets: number, pct: number) => ({
      movementLiftId: 2,
      computed: calcCrossSets(
        { movementLiftId: 2, weightMode: 'percent' as const, percent: pct, sets, reps: 5 },
        300, 1, 45,
      ),
    })
    const out = composeCrossSets([plan(3, 0.7), plan(3, 0.5)], [
      { sessionId: 1, type: 'cross', setNumber: 1, weight: 999, reps: 5, isAmrap: false, liftId: 2 },
    ])
    // Both blocks treat set 1 as logged and take 999 as the override for the
    // rest. Pinned so the storage invariant is the thing keeping this unreached.
    expect(out.filter(s => s.weight === 999)).toHaveLength(4)
  })
})

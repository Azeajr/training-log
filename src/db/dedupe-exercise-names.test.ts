// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'

beforeEach(async () => { await __resetForTest() })

const raw = (sql: string) =>
  db.exercises._query(sql, []) as unknown as Promise<Record<string, unknown>[]>

/** Re-run the migrations the way init() does: in order, errors swallowed. */
async function applyMigrations() {
  for (const sql of ADDITIVE_MIGRATIONS) {
    try { await raw(sql) } catch { /* already applied */ }
  }
}

// ── F101 ────────────────────────────────────────────────────────────────────
// idx_exercises_name_nocase is an additive migration, and migrations run inside
// a swallowed try/catch so a database already holding duplicates still boots.
// The consequence: exactly those installs silently kept no uniqueness guarantee.
// Reconciling the names first lets the index actually take.
describe('duplicate exercise names are reconciled (F101)', () => {
  async function withDuplicates() {
    // Drop the index so the pre-fix state can be recreated at all.
    await raw('DROP INDEX IF EXISTS idx_exercises_name_nocase')
    await db.exercises.add({ name: 'Dips', type: 'reps' } as never)
    await db.exercises.add({ name: '  dips  ', type: 'reps' } as never)
    await db.exercises.add({ name: 'Plank', type: 'timed' } as never)
  }

  it('suffixes the later twin and keeps the earliest name', async () => {
    await withDuplicates()
    await applyMigrations()

    const names = (await db.exercises.toArray()).map(e => e.name).sort()
    expect(names).toContain('Dips')
    expect(names).toContain('Plank')
    // The twin is renamed, not deleted — it may carry logged history.
    expect(names).toHaveLength(3)
    expect(names.some(n => /dips.*\(\d+\)/i.test(n))).toBe(true)
  })

  it('lets the unique index take once names are reconciled', async () => {
    await withDuplicates()
    await applyMigrations()

    const idx = await raw(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_exercises_name_nocase'",
    )
    expect(idx).toHaveLength(1)
    // And it now actually holds the line.
    await expect(db.exercises.add({ name: 'DIPS', type: 'reps' } as never)).rejects.toThrow()
  })

  it('is a no-op on a database that was already healthy', async () => {
    await db.exercises.add({ name: 'Dips', type: 'reps' } as never)
    await applyMigrations()
    expect((await db.exercises.toArray()).map(e => e.name)).toEqual(['Dips'])
  })
})

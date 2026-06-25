// @vitest-environment jsdom
import { vi, describe, it, expect } from 'vitest'
import type { TrainingDB } from '../db'

// seedDatabase() caches its promise in a module-level `_seed` variable.
// vi.resetModules() resets that cache AND creates a fresh in-process SQLite DB
// (schema applied, no rows). All imports AFTER resetModules share the same
// fresh singleton, so db and seedDatabase see the same data.
async function freshContext() {
  vi.resetModules()
  const [dbMod, seedMod] = await Promise.all([
    import('../db'),
    import('../db/seed'),
  ])
  return {
    db: dbMod.db as TrainingDB,
    seedDatabase: seedMod.seedDatabase as () => Promise<void>,
  }
}

describe('seedDatabase — fresh DB', () => {
  it('inserts 4 lifts in canonical order (OHP → Deadlift → Bench → Squat)', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const lifts = await db.lifts.orderBy('order').toArray()
    expect(lifts).toHaveLength(4)
    expect(lifts.map(l => l.name)).toEqual(['OHP', 'Deadlift', 'Bench', 'Squat'])
  })

  it('lifts have correct progressionIncrements', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const lifts = await db.lifts.orderBy('order').toArray()
    const inc = Object.fromEntries(lifts.map(l => [l.name, l.progressionIncrement]))
    expect(inc['OHP']).toBe(5)
    expect(inc['Bench']).toBe(5)
    expect(inc['Deadlift']).toBe(10)
    expect(inc['Squat']).toBe(10)
  })

  it('inserts 24 exercises', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    expect(await db.exercises.count()).toBe(24)
  })

  it('every seeded exercise has an assistance category', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const exercises = await db.exercises.toArray()
    expect(exercises.every(e => e.category != null)).toBe(true)
    expect(exercises.some(e => e.category === 'push')).toBe(true)
  })

  it('inserts 12 lift accessories', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    expect(await db.liftAccessories.count()).toBe(12)
  })

  it('inserts 1 settings row', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    expect(await db.settings.count()).toBe(1)
  })

  it('all lift accessories reference valid lift and exercise IDs', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const liftIds = new Set((await db.lifts.toArray()).map(l => l.id!))
    const exIds   = new Set((await db.exercises.toArray()).map(e => e.id!))
    const accessories = await db.liftAccessories.toArray()
    for (const acc of accessories) {
      expect(liftIds.has(acc.liftId)).toBe(true)
      expect(exIds.has(acc.exerciseId)).toBe(true)
    }
  })

  it('OHP gets Chinups, Lat Pulldowns, and Bicep Curls accessories', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const lifts = await db.lifts.orderBy('order').toArray()
    const ohp = lifts.find(l => l.name === 'OHP')!
    const accessories = await db.liftAccessories
      .where('liftId').equals(ohp.id!)
      .toArray()
    const exercises = await db.exercises.toArray()
    const exMap = Object.fromEntries(exercises.map(e => [e.id!, e.name]))
    const names = accessories.map(a => exMap[a.exerciseId]).sort()
    expect(names).toEqual(['Bicep Curls', 'Chinups', 'Lat Pulldowns'])
  })
})

describe('seedDatabase — idempotency', () => {
  it('second call does not duplicate any table', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    await seedDatabase() // cached _seed promise — no DB changes
    expect(await db.lifts.count()).toBe(4)
    expect(await db.exercises.count()).toBe(24)
    expect(await db.liftAccessories.count()).toBe(12)
    expect(await db.settings.count()).toBe(1)
  })
})

describe('seedDatabase — partial recovery', () => {
  it('re-seeds lifts when fewer than 4 exist', async () => {
    const { db, seedDatabase } = await freshContext()
    await db.lifts.bulkAdd([
      { name: 'OHP' as const,      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
    ])
    expect(await db.lifts.count()).toBe(2)
    await seedDatabase()
    expect(await db.lifts.count()).toBe(4)
  })

  it('re-seeds exercises when fewer than the full set exist', async () => {
    const { db, seedDatabase } = await freshContext()
    await db.lifts.bulkAdd([
      { name: 'OHP' as const,      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
      { name: 'Bench' as const,    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { name: 'Squat' as const,    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
    ])
    await db.exercises.bulkAdd([
      { name: 'Chinups',     type: 'reps' as const },
      { name: 'Bicep Curls', type: 'reps' as const },
    ])
    expect(await db.exercises.count()).toBe(2)
    await seedDatabase()
    expect(await db.exercises.count()).toBe(24)
  })

  it('backfills the category onto default exercises that predate the column', async () => {
    const { db, seedDatabase } = await freshContext()
    // A default exercise inserted before the category column existed (NULL).
    const chinId = await db.exercises.add({ name: 'Chinups', type: 'reps' as const })
    // A user-set category must survive the backfill untouched.
    const curlId = await db.exercises.add({ name: 'Bicep Curls', type: 'reps' as const, category: 'core' as const })

    await seedDatabase()

    expect((await db.exercises.get(chinId))?.category).toBe('pull')
    expect((await db.exercises.get(curlId))?.category).toBe('core')
  })

  it('does not seed accessories when any already exist', async () => {
    const { db, seedDatabase } = await freshContext()
    // Full lifts + exercises so those branches are skipped
    await db.lifts.bulkAdd([
      { name: 'OHP' as const,      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
      { name: 'Bench' as const,    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { name: 'Squat' as const,    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
    ])
    await db.exercises.bulkAdd(
      Array.from({ length: 18 }, (_, i) => ({ name: `Ex${i}`, type: 'reps' as const }))
    )
    const [lift]     = await db.lifts.toArray()
    const [exercise] = await db.exercises.toArray()
    await db.liftAccessories.add({ liftId: lift.id!, exerciseId: exercise.id!, order: 1 })

    await seedDatabase()

    // accessoryCount was 1 (> 0) so seed skipped accessories
    expect(await db.liftAccessories.count()).toBe(1)
  })

  it('does not overwrite existing settings', async () => {
    const { db, seedDatabase } = await freshContext()
    await db.settings.add({
      restTimer1: 999, restTimer2: 999, restTimerFail: 999,
      theme: 'dark' as const, barWeight: 50, plates: [], supplementalTemplate: 'fsl' as const,
    })
    await seedDatabase()
    expect(await db.settings.count()).toBe(1)
    const [row] = await db.settings.toArray()
    expect(row.restTimer1).toBe(999)
  })
})

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

  it('inserts 27 exercises', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    expect(await db.exercises.count()).toBe(27)
  })

  it('every seeded exercise has an assistance category', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const exercises = await db.exercises.toArray()
    expect(exercises.every(e => e.category != null)).toBe(true)
    expect(exercises.some(e => e.category === 'push')).toBe(true)
  })

  it('inserts 1 settings row', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    expect(await db.settings.count()).toBe(1)
  })

})

describe('seedDatabase — idempotency', () => {
  it('second call does not duplicate any table', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    await seedDatabase() // cached _seed promise — no DB changes
    expect(await db.lifts.count()).toBe(4)
    expect(await db.exercises.count()).toBe(27)
    expect(await db.settings.count()).toBe(1)
  })
})

describe('seedDatabase — partial recovery', () => {
  // Deliberately inverted (F07). This used to assert that a two-lift roster was
  // topped back up to four, on the theory that a short roster meant a partial
  // seed. It cannot mean that: onboarding supports a smaller roster, and the
  // top-up deleted the survivors and re-created the defaults with new ids,
  // orphaning every training max and session that referenced them. A non-empty
  // lifts table is the user's roster; only an empty one gets seeded.
  it('leaves a two-lift roster alone rather than topping it up', async () => {
    const { db, seedDatabase } = await freshContext()
    await db.lifts.bulkAdd([
      { name: 'OHP' as const,      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
    ])
    expect(await db.lifts.count()).toBe(2)
    await seedDatabase()
    expect(await db.lifts.count()).toBe(2)
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
    expect(await db.exercises.count()).toBe(27)
  })

  it('force-resets default exercises to their canonical category', async () => {
    const { db, seedDatabase } = await freshContext()
    // A default exercise inserted before the category column existed (NULL).
    const chinId = await db.exercises.add({ name: 'Chinups', type: 'reps' as const })
    // A default whose category drifted to a wrong value — force-reset wins.
    const curlId = await db.exercises.add({ name: 'Bicep Curls', type: 'reps' as const, category: 'core' as const })

    await seedDatabase()

    expect((await db.exercises.get(chinId))?.category).toBe('pull')
    expect((await db.exercises.get(curlId))?.category).toBe('pull')
  })

  it("renames the legacy 'single_leg' tag to 'legs', defaults and customs alike", async () => {
    const { db, seedDatabase } = await freshContext()
    // Legacy default (force-reset to canonical 'legs') + a custom on the old tag.
    const legId = await db.exercises.add({ name: 'Leg Press', type: 'reps' as const, category: 'single_leg' as unknown as 'legs' })
    const customId = await db.exercises.add({ name: 'Sissy Squat', type: 'reps' as const, category: 'single_leg' as unknown as 'legs' })

    await seedDatabase()

    expect((await db.exercises.get(legId))?.category).toBe('legs')
    expect((await db.exercises.get(customId))?.category).toBe('legs')
  })

  it('preserves a custom exercise category that is not the legacy tag', async () => {
    const { db, seedDatabase } = await freshContext()
    const customId = await db.exercises.add({ name: 'Cable Fly', type: 'reps' as const, category: 'push' as const })

    await seedDatabase()

    expect((await db.exercises.get(customId))?.category).toBe('push')
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

// ── F07 / F98 ───────────────────────────────────────────────────────────────
// Seeding re-seeded whenever `lifts.count() < LIFTS.length`, on the theory that
// a short roster meant a partial seed. A smaller roster is a supported
// onboarding choice, so for those users every startup deleted the survivors and
// re-created the defaults with NEW ids — orphaning the training maxes and
// session history that referenced the old ones, and undoing any customisation.
//
// F98 is the other half: that path did `clear()` then `bulkAdd()` as two
// statements, so a failure between them left the roster empty.
describe('seedDatabase — an existing roster is the user\'s, not a partial seed', () => {
  it('leaves a deliberately smaller roster alone (F07)', async () => {
    const { db, seedDatabase } = await freshContext()
    const benchId = await db.lifts.add({
      name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper',
    } as never)
    const squatId = await db.lifts.add({
      name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower',
    } as never)

    await seedDatabase()

    const lifts = await db.lifts.orderBy('order').toArray()
    expect(lifts.map(l => l.name)).toEqual(['Bench', 'Squat'])
    // Same rows, not replacements — ids are what history references.
    expect(lifts.map(l => l.id)).toEqual([benchId, squatId])
  })

  it('does not orphan training maxes belonging to a smaller roster (F07)', async () => {
    const { db, seedDatabase } = await freshContext()
    const benchId = await db.lifts.add({
      name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper',
    } as never)
    await db.trainingMaxes.add({ liftId: benchId, weight: 185, setAt: new Date('2026-01-01') })

    await seedDatabase()

    const tms = await db.trainingMaxes.toArray()
    expect(tms).toHaveLength(1)
    // The TM must still resolve to a lift that exists.
    expect(await db.lifts.get(tms[0].liftId)).toBeTruthy()
  })

  it('keeps a customised lift rather than resetting it (F07)', async () => {
    const { db, seedDatabase } = await freshContext()
    await db.lifts.add({
      name: 'OHP', order: 1, progressionIncrement: 2.5, baseWeight: 70, liftType: 'upper',
    } as never)

    await seedDatabase()

    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(1)
    expect(lifts[0].progressionIncrement).toBe(2.5)
    expect(lifts[0].baseWeight).toBe(70)
  })

  it('still seeds a genuinely empty install', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    expect(await db.lifts.count()).toBe(4)
  })

  it('never clears the lifts table, so there is no empty window (F98)', async () => {
    const { db, seedDatabase } = await freshContext()
    await seedDatabase()
    const before = (await db.lifts.toArray()).map(l => l.id)
    await seedDatabase()
    expect((await db.lifts.toArray()).map(l => l.id)).toEqual(before)
  })
})

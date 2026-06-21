import { db } from './index'
import { SETTINGS_DEFAULTS } from '../store/settings-store'

const LIFTS = [
  { name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

const EXERCISES = [
  { name: 'Chinups',                      type: 'reps'     as const },
  { name: 'Lat Pulldowns',                type: 'reps'     as const },
  { name: 'Bicep Curls',                  type: 'reps'     as const },
  { name: 'Glute Ham Raise',              type: 'reps'     as const },
  { name: 'Bulgarian Split Squat',        type: 'reps'     as const },
  { name: 'Nordic Curls',                 type: 'reps'     as const },
  { name: 'Hip Thrust',                   type: 'reps'     as const },
  { name: 'Barbell Row',                  type: 'reps'     as const },
  { name: 'Dumbbell Row',                 type: 'reps'     as const },
  { name: 'T Bar Row',                    type: 'reps'     as const },
  { name: 'Ab Wheel',                     type: 'reps'     as const },
  { name: 'Single Leg Romanian Deadlift', type: 'reps'     as const },
  { name: 'Romanian Deadlift',            type: 'reps'     as const },
  { name: 'Back Extension',               type: 'reps'     as const },
  { name: 'Good Mornings',                type: 'reps'     as const },
  { name: 'Leg Press',                    type: 'reps'     as const },
  { name: 'Loaded Carry',                 type: 'distance' as const },
  { name: 'Plank',                        type: 'timed'    as const },
  { name: 'Reverse Nordic',               type: 'reps'     as const },
  { name: 'Pull Through',                 type: 'reps'     as const },
]

let _seed: Promise<void> | null = null
export function seedDatabase(): Promise<void> {
  if (!_seed) {
    _seed = _seedDatabase().catch(err => { _seed = null; throw err })
  }
  return _seed
}

async function _seedDatabase() {
  // Seed lifts — re-seed if count is less than expected (handles partial-seed recovery)
  const liftCount = await db.lifts.count()
  if (liftCount < LIFTS.length) {
    if (liftCount > 0) await db.lifts.clear()
    await db.lifts.bulkAdd(LIFTS)
  }

  // Seed exercises — add any missing by name. Additive (never clears) so a
  // version bump that adds new defaults can't wipe a user's library or orphan
  // the accessory rows that reference exercise ids.
  const existingExNames = new Set((await db.exercises.toArray()).map(e => e.name))
  const missingExercises = EXERCISES.filter(e => !existingExNames.has(e.name))
  if (missingExercises.length > 0) await db.exercises.bulkAdd(missingExercises)

  // Seed lift accessories if missing — done separately so a partial first-run recovers
  const accessoryCount = await db.liftAccessories.count()
  if (accessoryCount === 0) {
    const lifts = await db.lifts.orderBy('order').toArray()
    const exercises = await db.exercises.toArray()

    const byName = (name: string) => exercises.find(e => e.name === name)!.id!
    const liftId = (name: string) => lifts.find(l => l.name === name)!.id!

    await db.liftAccessories.bulkAdd([
      { liftId: liftId('OHP'), exerciseId: byName('Chinups'),       order: 1 },
      { liftId: liftId('OHP'), exerciseId: byName('Lat Pulldowns'), order: 2 },
      { liftId: liftId('OHP'), exerciseId: byName('Bicep Curls'),   order: 3 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Nordic Curls'),          order: 1 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Bulgarian Split Squat'), order: 2 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Leg Press'),             order: 3 },
      { liftId: liftId('Bench'), exerciseId: byName('Barbell Row'),  order: 1 },
      { liftId: liftId('Bench'), exerciseId: byName('T Bar Row'),    order: 2 },
      { liftId: liftId('Bench'), exerciseId: byName('Dumbbell Row'), order: 3 },
      { liftId: liftId('Squat'), exerciseId: byName('Reverse Nordic'),                order: 1 },
      { liftId: liftId('Squat'), exerciseId: byName('Single Leg Romanian Deadlift'), order: 2 },
      { liftId: liftId('Squat'), exerciseId: byName('Pull Through'),                  order: 3 },
    ])
  }

  // Seed settings if missing
  const settingsCount = await db.settings.count()
  if (settingsCount === 0) {
    await db.settings.add(SETTINGS_DEFAULTS)
  }
}

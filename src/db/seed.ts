import { db } from './db'

const LIFTS = [
  { name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

const EXERCISES = [
  { name: 'Chinups',                      type: 'reps'     as const },
  { name: 'Lat Pulldowns',                type: 'reps'     as const },
  { name: 'Curls',                        type: 'reps'     as const },
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
]

export async function seedDatabase() {
  // Seed lifts if missing
  const liftCount = await db.lifts.count()
  if (liftCount === 0) {
    await db.lifts.bulkAdd(LIFTS)
  }

  // Seed exercises if missing
  const exerciseCount = await db.exercises.count()
  if (exerciseCount === 0) {
    await db.exercises.bulkAdd(EXERCISES)
  }

  // Seed lift accessories if missing — done separately so a partial first-run recovers
  const accessoryCount = await db.liftAccessories.count()
  if (accessoryCount === 0) {
    const lifts = (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
    const exercises = await db.exercises.toArray()

    const byName = (name: string) => exercises.find(e => e.name === name)!.id!
    const liftId = (name: string) => lifts.find(l => l.name === name)!.id!

    await db.liftAccessories.bulkAdd([
      { liftId: liftId('OHP'), exerciseId: byName('Chinups'),       order: 1 },
      { liftId: liftId('OHP'), exerciseId: byName('Lat Pulldowns'), order: 2 },
      { liftId: liftId('OHP'), exerciseId: byName('Curls'),         order: 3 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Glute Ham Raise'),       order: 1 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Bulgarian Split Squat'), order: 2 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Nordic Curls'),          order: 3 },
      { liftId: liftId('Deadlift'), exerciseId: byName('Hip Thrust'),            order: 4 },
      { liftId: liftId('Bench'), exerciseId: byName('Barbell Row'),  order: 1 },
      { liftId: liftId('Bench'), exerciseId: byName('Dumbbell Row'), order: 2 },
      { liftId: liftId('Bench'), exerciseId: byName('T Bar Row'),    order: 3 },
      { liftId: liftId('Squat'), exerciseId: byName('Ab Wheel'),                     order: 1 },
      { liftId: liftId('Squat'), exerciseId: byName('Single Leg Romanian Deadlift'), order: 2 },
      { liftId: liftId('Squat'), exerciseId: byName('Romanian Deadlift'),            order: 3 },
      { liftId: liftId('Squat'), exerciseId: byName('Back Extension'),               order: 4 },
      { liftId: liftId('Squat'), exerciseId: byName('Good Mornings'),                order: 5 },
      { liftId: liftId('Squat'), exerciseId: byName('Leg Press'),                    order: 6 },
    ])
  }

  // Seed settings if missing
  const settingsCount = await db.settings.count()
  if (settingsCount === 0) {
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300 })
  }
}

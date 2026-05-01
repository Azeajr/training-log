import { db } from './db'

export async function seedDatabase() {
  const liftCount = await db.lifts.count()
  if (liftCount > 0) return

  await db.lifts.bulkAdd([
    { name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
    { name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
    { name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
    { name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
  ])

  await db.exercises.bulkAdd([
    { name: 'Chinups',                      type: 'reps'     },
    { name: 'Lat Pulldowns',                type: 'reps'     },
    { name: 'Curls',                        type: 'reps'     },
    { name: 'Glute Ham Raise',              type: 'reps'     },
    { name: 'Bulgarian Split Squat',        type: 'reps'     },
    { name: 'Nordic Curls',                 type: 'reps'     },
    { name: 'Hip Thrust',                   type: 'reps'     },
    { name: 'Barbell Row',                  type: 'reps'     },
    { name: 'Dumbbell Row',                 type: 'reps'     },
    { name: 'T Bar Row',                    type: 'reps'     },
    { name: 'Ab Wheel',                     type: 'reps'     },
    { name: 'Single Leg Romanian Deadlift', type: 'reps'     },
    { name: 'Romanian Deadlift',            type: 'reps'     },
    { name: 'Back Extension',               type: 'reps'     },
    { name: 'Good Mornings',                type: 'reps'     },
    { name: 'Leg Press',                    type: 'reps'     },
    { name: 'Loaded Carry',                 type: 'distance' },
    { name: 'Plank',                        type: 'timed'    },
  ])

  const lifts = await db.lifts.orderBy('order').toArray()
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

  await db.settings.add({
    restTimer1: 90,
    restTimer2: 180,
    restTimerFail: 300,
  })
}

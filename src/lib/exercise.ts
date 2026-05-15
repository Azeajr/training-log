import type { TrainingDB } from './types'

export async function createExercise(
  db: TrainingDB,
  name: string,
  type: 'reps' | 'timed' | 'distance'
): Promise<number> {
  return db.exercises.add({ name, type })
}

export async function renameExercise(db: TrainingDB, id: number, name: string): Promise<void> {
  await db.exercises.update(id, { name })
}

export async function archiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: true })
  await db.liftAccessories.where('exerciseId').equals(id).delete()
}

export async function unarchiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: false })
}

export async function addExerciseToLift(
  db: TrainingDB,
  liftId: number,
  exerciseId: number,
  currentCount: number
): Promise<void> {
  await db.liftAccessories.add({ liftId, exerciseId, order: currentCount })
}

export async function removeExerciseFromLift(db: TrainingDB, liftAccessoryId: number): Promise<void> {
  await db.liftAccessories.delete(liftAccessoryId)
}

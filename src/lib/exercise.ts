import type { TrainingDB } from '../db/index'
import type { ExerciseCategory } from '../types/domain'

export async function createExercise(
  db: TrainingDB,
  name: string,
  type: 'reps' | 'timed' | 'distance',
  category?: ExerciseCategory
): Promise<number> {
  return db.exercises.add({ name, type, category })
}

export async function renameExercise(db: TrainingDB, id: number, name: string): Promise<void> {
  await db.exercises.update(id, { name })
}

export async function setExerciseCategory(db: TrainingDB, id: number, category: ExerciseCategory): Promise<void> {
  await db.exercises.update(id, { category })
}

export async function archiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.transaction(async () => {
    await db.exercises.update(id, { archived: true })
    await db.liftAccessories.where('exerciseId').equals(id).delete()
  })
}

export async function unarchiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: false })
}

export async function addExerciseToLift(
  db: TrainingDB,
  liftId: number,
  exerciseId: number
): Promise<void> {
  const existing = await db.liftAccessories.where('liftId').equals(liftId).toArray()
  const nextOrder = existing.reduce((m, la) => Math.max(m, la.order), -1) + 1
  await db.liftAccessories.add({ liftId, exerciseId, order: nextOrder })
}

export async function removeExerciseFromLift(db: TrainingDB, liftAccessoryId: number): Promise<void> {
  await db.liftAccessories.delete(liftAccessoryId)
}

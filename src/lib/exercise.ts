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

export async function setExerciseUsesBarbell(db: TrainingDB, id: number, usesBarbell: boolean): Promise<void> {
  await db.exercises.update(id, { usesBarbell })
}

export async function archiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: true })
}

export async function unarchiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: false })
}

import type { TrainingDB } from '../db/index'
import type { ExerciseCategory, PlateMode } from '../types/domain'

export class ExerciseNameConflictError extends Error {
  constructor(name: string) {
    super(`An exercise named "${name}" already exists`)
    this.name = 'ExerciseNameConflictError'
  }
}

async function assertUniqueExerciseName(db: TrainingDB, name: string, excludeId?: number): Promise<void> {
  const normalizedName = name.trim().toLocaleLowerCase()
  const duplicate = (await db.exercises.toArray()).some(exercise =>
    exercise.id !== excludeId && exercise.name.trim().toLocaleLowerCase() === normalizedName
  )
  if (duplicate) throw new ExerciseNameConflictError(name)
}

export async function createExercise(
  db: TrainingDB,
  name: string,
  type: 'reps' | 'timed' | 'distance',
  category?: ExerciseCategory
): Promise<number> {
  const trimmedName = name.trim()
  await assertUniqueExerciseName(db, trimmedName)
  return db.exercises.add({ name: trimmedName, type, category })
}

export async function renameExercise(db: TrainingDB, id: number, name: string): Promise<void> {
  const trimmedName = name.trim()
  await assertUniqueExerciseName(db, trimmedName, id)
  await db.exercises.update(id, { name: trimmedName })
}

export async function setExerciseCategory(db: TrainingDB, id: number, category: ExerciseCategory): Promise<void> {
  await db.exercises.update(id, { category })
}

export async function setExercisePlateLoading(
  db: TrainingDB,
  id: number,
  plateMode: PlateMode,
  implementBase: number | null,
): Promise<void> {
  await db.exercises.update(id, { plateMode, implementBase })
}

export async function archiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: true })
}

export async function unarchiveExercise(db: TrainingDB, id: number): Promise<void> {
  await db.exercises.update(id, { archived: false })
}

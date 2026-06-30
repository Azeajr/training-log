export interface CleanupPlan {
  orphanAtmIds: number[]
  orphanSetIds: number[]
  exercisesToArchive: number[]
}

export function buildCleanupPlan(
  exercises: Array<{ id: number; archived?: boolean }>,
  accessoryTrainingMaxes: Array<{ id: number; exerciseId: number }>,
  accessorySets: Array<{ id: number; sessionId: number; exerciseId: number }>,
  sessions: Array<{ id: number }>,
): CleanupPlan {
  const validExerciseIds = new Set(exercises.map(ex => ex.id))
  const validSessionIds = new Set(sessions.map(s => s.id))

  const orphanAtmIds = accessoryTrainingMaxes
    .filter(atm => !validExerciseIds.has(atm.exerciseId))
    .map(atm => atm.id)

  const orphanSetIds = accessorySets
    .filter(s => !validSessionIds.has(s.sessionId))
    .map(s => s.id)

  // With the per-lift roster gone, an exercise is "in use" only if it has
  // surviving logged sets. Never-logged library exercises become archive
  // candidates (reversible — they can be unarchived).
  const survivingSetExIds = new Set(
    accessorySets
      .filter(s => validSessionIds.has(s.sessionId))
      .map(s => s.exerciseId)
  )

  const exercisesToArchive = exercises
    .filter(ex => !ex.archived && !survivingSetExIds.has(ex.id))
    .map(ex => ex.id)

  return { orphanAtmIds, orphanSetIds, exercisesToArchive }
}

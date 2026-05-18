export interface CleanupPlan {
  orphanLaIds: number[]
  orphanAtmIds: number[]
  orphanSetIds: number[]
  exercisesToArchive: number[]
}

export function buildCleanupPlan(
  exercises: Array<{ id: number; archived?: boolean }>,
  liftAccessories: Array<{ id: number; exerciseId: number }>,
  accessoryTrainingMaxes: Array<{ id: number; exerciseId: number }>,
  accessorySets: Array<{ id: number; sessionId: number; exerciseId: number }>,
  sessions: Array<{ id: number }>,
): CleanupPlan {
  const validExerciseIds = new Set(exercises.map(ex => ex.id))
  const validSessionIds = new Set(sessions.map(s => s.id))

  const orphanLaIds = liftAccessories
    .filter(la => !validExerciseIds.has(la.exerciseId))
    .map(la => la.id)

  const orphanAtmIds = accessoryTrainingMaxes
    .filter(atm => !validExerciseIds.has(atm.exerciseId))
    .map(atm => atm.id)

  const orphanSetIds = accessorySets
    .filter(s => !validSessionIds.has(s.sessionId))
    .map(s => s.id)

  // Compute post-cleanup la/set membership to decide what to archive
  const survivingLaExIds = new Set(
    liftAccessories
      .filter(la => validExerciseIds.has(la.exerciseId))
      .map(la => la.exerciseId)
  )
  const survivingSetExIds = new Set(
    accessorySets
      .filter(s => validSessionIds.has(s.sessionId))
      .map(s => s.exerciseId)
  )

  const exercisesToArchive = exercises
    .filter(ex => !ex.archived && !survivingLaExIds.has(ex.id) && !survivingSetExIds.has(ex.id))
    .map(ex => ex.id)

  return { orphanLaIds, orphanAtmIds, orphanSetIds, exercisesToArchive }
}

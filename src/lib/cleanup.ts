export interface CleanupPlan {
  orphanAtmIds: number[]
  orphanSetIds: number[]
  exercisesToArchive: number[]
  /** Names of the above, so the confirmation can say what it is about to do. */
  exerciseNamesToArchive: string[]
}

export function buildCleanupPlan(
  exercises: Array<{ id: number; name?: string; archived?: boolean }>,
  accessoryTrainingMaxes: Array<{ id: number; exerciseId: number }>,
  accessorySets: Array<{ id: number; sessionId: number; exerciseId: number }>,
  sessions: Array<{ id: number }>,
  assistanceDefaults: Array<{ exerciseId: number }> = [],
): CleanupPlan {
  const validExerciseIds = new Set(exercises.map(ex => ex.id))
  const validSessionIds = new Set(sessions.map(s => s.id))

  const orphanAtmIds = accessoryTrainingMaxes
    .filter(atm => !validExerciseIds.has(atm.exerciseId))
    .map(atm => atm.id)

  const orphanSetIds = accessorySets
    .filter(s => !validSessionIds.has(s.sessionId))
    .map(s => s.id)

  // "In use" is not only "has logged sets". It used to be, so CLEANUP archived
  // an exercise the user had just configured as a lift's assistance default and
  // given a training max — the slot then resolved to nothing and Today showed an
  // empty push slot, with the toast reporting only a count (F45).
  //
  // Configuration counts as use: a live assistanceDefaults reference, or an
  // accessory training max, both mean the user has said they intend to do this
  // exercise even though they have not logged it yet.
  const survivingSetExIds = new Set(
    accessorySets
      .filter(s => validSessionIds.has(s.sessionId))
      .map(s => s.exerciseId)
  )
  const configuredExIds = new Set([
    ...assistanceDefaults.map(d => d.exerciseId),
    ...accessoryTrainingMaxes
      .filter(atm => validExerciseIds.has(atm.exerciseId))
      .map(atm => atm.exerciseId),
  ])

  const toArchive = exercises.filter(
    ex => !ex.archived && !survivingSetExIds.has(ex.id) && !configuredExIds.has(ex.id),
  )
  const exercisesToArchive = toArchive.map(ex => ex.id)
  const exerciseNamesToArchive = toArchive.map(ex => ex.name ?? String(ex.id))

  return { orphanAtmIds, orphanSetIds, exercisesToArchive, exerciseNamesToArchive }
}

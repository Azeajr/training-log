import { db, TrainingDB } from '../db/db'

export async function getNextSession(database: TrainingDB = db): Promise<{
  liftId: number
  week: 1 | 2 | 3 | 4
  cycleId: number
}> {
  const cycle = await database.cycles.orderBy('number').last()
  if (!cycle?.id) {
    const cycleId = await database.cycles.add({
      number: 1,
      startDate: new Date(),
      endDate: null,
    })
    const lifts = (await database.lifts.toArray()).sort((a, b) => a.order - b.order)
    return { liftId: lifts[0].id!, week: 1, cycleId }
  }

  const sessions = await database.sessions
    .where('cycleId').equals(cycle.id)
    .toArray()

  const weekCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  sessions.forEach(s => {
    if (s.status !== 'pending') weekCounts[s.week]++
  })

  if (weekCounts[4] >= 4) {
    const newCycleId = await database.cycles.add({
      number: cycle.number + 1,
      startDate: new Date(),
      endDate: null,
    })
    await applyTmProgression(database)
    await applyAccessoryTmProgression(database, cycle.id)
    const lifts = (await database.lifts.toArray()).sort((a, b) => a.order - b.order)
    return { liftId: lifts[0].id!, week: 1, cycleId: newCycleId }
  }

  let currentWeek: 1 | 2 | 3 | 4 = 1
  for (const w of [1, 2, 3, 4] as const) {
    if (weekCounts[w] < 4) { currentWeek = w; break }
  }

  const completedLiftIds = sessions
    .filter(s => s.week === currentWeek && s.status !== 'pending')
    .map(s => s.liftId)

  const lifts = (await database.lifts.toArray()).sort((a, b) => a.order - b.order)
  const nextLift = lifts.find(l => !completedLiftIds.includes(l.id!))

  return {
    liftId: nextLift?.id ?? lifts[0].id!,
    week: currentWeek,
    cycleId: cycle.id,
  }
}

export async function applyTmProgression(database: TrainingDB = db) {
  const lifts = await database.lifts.toArray()
  for (const lift of lifts) {
    const tms = await database.trainingMaxes
      .where('liftId').equals(lift.id!)
      .sortBy('setAt')
    const currentTm = tms[tms.length - 1]
    if (currentTm) {
      await database.trainingMaxes.add({
        liftId: lift.id!,
        weight: currentTm.weight + lift.progressionIncrement,
        setAt: new Date(),
      })
    }
  }
}

export async function applyAccessoryTmProgression(database: TrainingDB = db, cycleId: number) {
  const sessions = await database.sessions.where('cycleId').equals(cycleId).toArray()
  const sessionIds = sessions.map(s => s.id!)
  const accessorySets = await database.accessorySets
    .where('sessionId').anyOf(sessionIds)
    .toArray()

  const usedExerciseIds = [...new Set(accessorySets.map(a => a.exerciseId))]

  for (const exerciseId of usedExerciseIds) {
    const tms = await database.accessoryTrainingMaxes
      .where('exerciseId').equals(exerciseId)
      .sortBy('setAt')
    const currentTm = tms[tms.length - 1]
    if (currentTm) {
      await database.accessoryTrainingMaxes.add({
        exerciseId,
        weight: currentTm.weight + currentTm.incrementLb,
        incrementLb: currentTm.incrementLb,
        setAt: new Date(),
      })
    }
  }
}

export async function getAmrapTargets(
  liftId: number,
  currentWeek: number,
  currentCycleId: number
): Promise<Array<{ weight: number; reps: number; label: string }>> {
  const allSessions = await db.sessions
    .where('liftId').equals(liftId)
    .filter(s => s.status === 'completed' && s.week !== 4)
    .toArray()

  allSessions.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const getAmrapSet = (sessionId: number) =>
    db.sets
      .where('sessionId').equals(sessionId)
      .filter(s => s.isAmrap)
      .first()

  const targets: Array<{ weight: number; reps: number; label: string }> = []

  const lastSession = allSessions[0]
  if (lastSession?.id) {
    const amrap = await getAmrapSet(lastSession.id)
    if (amrap) targets.push({ weight: amrap.weight, reps: amrap.reps, label: 'Last session' })
  }

  const prevCycleSession = allSessions.find(s =>
    s.cycleId !== currentCycleId && s.week === currentWeek
  )
  if (prevCycleSession?.id) {
    const amrap = await getAmrapSet(prevCycleSession.id)
    if (amrap) targets.push({ weight: amrap.weight, reps: amrap.reps, label: 'Last cycle' })
  }

  return targets
}

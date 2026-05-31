import type { TrainingDB } from '../db/index'
import type { Lift, TrainingMax } from '../types/domain'
import { getCycleDoublingCandidates } from './tm-recommendations'
import type { DoublingCandidate } from './tm-recommendations'

const WEEKS = [1, 2, 3, 4] as const

const countCompletedByWeek = (sessions: Array<{ week: number; status: string }>) => {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const s of sessions) {
    if (s.status !== 'pending') counts[s.week]++
  }
  return counts
}

async function progressTms(
  db: TrainingDB,
  nextWeight: (current: TrainingMax, lift: Lift) => number,
): Promise<void> {
  const lifts = await db.lifts.toArray()
  for (const lift of lifts) {
    const tms = await db.trainingMaxes.where('liftId').equals(lift.id!).sortBy('setAt')
    const current = tms[tms.length - 1]
    if (!current) continue
    await db.trainingMaxes.add({
      liftId: lift.id!,
      weight: nextWeight(current, lift),
      setAt: new Date(),
    })
  }
}

export async function advanceCycleIfComplete(db: TrainingDB): Promise<{
  advanced: boolean
  doublingCandidates: DoublingCandidate[]
  newTms: Array<{ liftName: string; oldWeight: number; weight: number }>
}> {
  const cycle = await db.cycles.orderBy('number').last()
  if (!cycle?.id) return { advanced: false, doublingCandidates: [], newTms: [] }

  const sessions = await db.sessions.where('cycleId').equals(cycle.id).toArray()
  const weekCounts = countCompletedByWeek(sessions)

  if (weekCounts[4] < 4) return { advanced: false, doublingCandidates: [], newTms: [] }

  // Compute before progression fires so TM bump detection sees pre-progression state
  const doublingCandidates = await getCycleDoublingCandidates(db, cycle)

  const cycleId = cycle.id!
  await db.transaction(async () => {
    await db.cycles.add({ number: cycle.number + 1, startDate: new Date(), endDate: null })
    await applyTmProgression(db)
    await applyAccessoryTmProgression(db, cycleId)
  })

  const lifts = await db.lifts.orderBy('order').toArray()
  const newTms: Array<{ liftName: string; oldWeight: number; weight: number }> = []
  for (const lift of lifts) {
    const tms = await db.trainingMaxes.where('liftId').equals(lift.id!).sortBy('setAt')
    const prev = tms[tms.length - 2]
    const latest = tms[tms.length - 1]
    if (latest) newTms.push({ liftName: lift.name, oldWeight: prev?.weight ?? latest.weight, weight: latest.weight })
  }

  return { advanced: true, doublingCandidates, newTms }
}

export async function applyTmProgression(db: TrainingDB): Promise<void> {
  await progressTms(db, (current, lift) => current.weight + lift.progressionIncrement)
}

export async function applyAccessoryTmProgression(db: TrainingDB, cycleId: number) {
  const sessions = await db.sessions.where('cycleId').equals(cycleId).toArray()
  const sessionIds = sessions.map(s => s.id!)
  const accessorySets = await db.accessorySets
    .where('sessionId').anyOf(sessionIds)
    .toArray()

  const usedExerciseIds = [...new Set(accessorySets.map(a => a.exerciseId))]

  for (const exerciseId of usedExerciseIds) {
    const tms = await db.accessoryTrainingMaxes
      .where('exerciseId').equals(exerciseId)
      .sortBy('setAt')
    const currentTm = tms[tms.length - 1]
    if (currentTm) {
      await db.accessoryTrainingMaxes.add({
        exerciseId,
        weight: currentTm.weight + currentTm.incrementLb,
        incrementLb: currentTm.incrementLb,
        setAt: new Date(),
      })
    }
  }
}

export async function deloadTms(db: TrainingDB, pct = 0.10): Promise<void> {
  await progressTms(db, current => Math.round(current.weight * (1 - pct) / 5) * 5)
}

export async function getNextSessionAdvancingIfDone(db: TrainingDB): Promise<{
  liftId: number
  week: 1 | 2 | 3 | 4
  cycleId: number
}> {
  let cycle = await db.cycles.orderBy('number').last()
  if (!cycle?.id) {
    const cycleId = await db.cycles.add({
      number: 1,
      startDate: new Date(),
      endDate: null,
    })
    const lifts = await db.lifts.orderBy('order').toArray()
    return { liftId: lifts[0].id!, week: 1, cycleId }
  }

  let sessions = await db.sessions
    .where('cycleId').equals(cycle.id)
    .toArray()

  let weekCounts = countCompletedByWeek(sessions)

  if (WEEKS.every(w => weekCounts[w] >= 4)) {
    await advanceCycleIfComplete(db)
    cycle = await db.cycles.orderBy('number').last()
    if (!cycle?.id) throw new Error('Cycle advance failed')
    sessions = []
    weekCounts = countCompletedByWeek(sessions)
  }

  let currentWeek: 1 | 2 | 3 | 4 = 1
  for (const w of WEEKS) {
    if (weekCounts[w] < 4) { currentWeek = w; break }
  }

  const completedLiftIds = sessions
    .filter(s => s.week === currentWeek && s.status !== 'pending')
    .map(s => s.liftId)

  const lifts = await db.lifts.orderBy('order').toArray()
  const nextLift = lifts.find(l => !completedLiftIds.includes(l.id!))

  return {
    liftId: nextLift?.id ?? lifts[0].id!,
    week: currentWeek,
    cycleId: cycle.id,
  }
}

export async function getAmrapTargets(
  db: TrainingDB,
  liftId: number,
  currentWeek: number,
  currentCycleId: number,
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

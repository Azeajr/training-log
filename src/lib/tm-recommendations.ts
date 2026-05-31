import { estimated1RM, TM_PCT_OF_1RM, roundToNearest5 } from './calc'
import { getCurrentTm } from './training-max'
import type { TrainingDB } from '../db/index'
import type { Cycle } from '../types/domain'

export const SESSION_TM_BUMP_THRESHOLD = 0.15
export const CYCLE_DOUBLE_THRESHOLD = 0.10
const CYCLE_START_TOLERANCE_MS = 60_000

export interface SessionTmRecommendation {
  liftId: number
  liftName: string
  currentTm: number
  suggestedTm: number
}

export interface DoublingCandidate {
  liftId: number
  liftName: string
  progressionIncrement: number
}

export async function getSessionTmRecommendation(
  db: TrainingDB,
  sessionId: number,
  liftId: number,
  liftName: string,
): Promise<SessionTmRecommendation | null> {
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
  const amrap = sets.find(s => s.type === 'main' && s.isAmrap)
  if (!amrap || amrap.reps < 1) return null

  const currentTm = await getCurrentTm(db, liftId)
  if (!currentTm) return null

  const e1rm = estimated1RM(amrap.weight, amrap.reps)
  const suggestedTm = roundToNearest5(e1rm * TM_PCT_OF_1RM)
  const delta = (suggestedTm - currentTm) / currentTm

  if (delta < SESSION_TM_BUMP_THRESHOLD) return null

  return { liftId, liftName, currentTm, suggestedTm }
}

export async function getCycleDoublingCandidates(
  db: TrainingDB,
  cycle: Cycle,
): Promise<DoublingCandidate[]> {
  const sessions = await db.sessions.where('cycleId').equals(cycle.id!).toArray()
  const workingSessions = sessions.filter(s => s.week !== 4 && s.status === 'completed')

  const byLift = new Map<number, typeof workingSessions>()
  for (const s of workingSessions) {
    if (!byLift.has(s.liftId)) byLift.set(s.liftId, [])
    byLift.get(s.liftId)!.push(s)
  }

  const lifts = await db.lifts.toArray()
  const candidates: DoublingCandidate[] = []
  const cycleStartTs = new Date(cycle.startDate).getTime()

  for (const [liftId, liftSessions] of byLift) {
    if (liftSessions.length < 3) continue

    const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')

    // Feature 1 bump = any TM set well after cycle creation (>60s tolerance)
    const hasBump = tms.some(tm => new Date(tm.setAt).getTime() > cycleStartTs + CYCLE_START_TOLERANCE_MS)
    if (hasBump) continue

    // The TM in effect at cycle start (auto-progression entry)
    const cycleTm = [...tms].reverse().find(
      tm => new Date(tm.setAt).getTime() <= cycleStartTs + CYCLE_START_TOLERANCE_MS
    )
    if (!cycleTm) continue

    let allOver = true
    for (const session of liftSessions) {
      const sets = await db.sets.where('sessionId').equals(session.id!).toArray()
      const amrap = sets.find(s => s.type === 'main' && s.isAmrap)
      if (!amrap || amrap.reps < 1) { allOver = false; break }

      const e1rm = estimated1RM(amrap.weight, amrap.reps)
      const suggestedTm = roundToNearest5(e1rm * TM_PCT_OF_1RM)
      const delta = (suggestedTm - cycleTm.weight) / cycleTm.weight
      if (delta < CYCLE_DOUBLE_THRESHOLD) { allOver = false; break }
    }

    if (!allOver) continue

    const lift = lifts.find(l => l.id === liftId)
    if (!lift) continue

    candidates.push({ liftId, liftName: lift.name, progressionIncrement: lift.progressionIncrement })
  }

  return candidates
}

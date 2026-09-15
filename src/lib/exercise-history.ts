import type { TrainingDB } from '../db/index'
import type { AccessorySet, Set } from '../types/domain'
import { baselineSets } from './performance'

export interface ExerciseHistoryEntry {
  date: Date
  sessionId: number
  sets: AccessorySet[]
  notes: string | null
}

export interface LiftHistoryEntry {
  date: Date
  week: 1 | 2 | 3 | 4
  sets: Set[]
  notes: string | null
}

export async function getExerciseHistory(db: TrainingDB, exerciseId: number): Promise<ExerciseHistoryEntry[]> {
  const sessions = await db.sessions
    .filter(s => s.status === 'completed')
    .toArray()

  const sessionIds = sessions.map(s => s.id!)
  if (sessionIds.length === 0) return []

  const [accSets, accNotes] = await Promise.all([
    db.accessorySets
      .where('sessionId').anyOf(sessionIds)
      .filter(s => s.exerciseId === exerciseId)
      .toArray(),
    db.accessoryNotes
      .where('sessionId').anyOf(sessionIds)
      .filter(n => n.exerciseId === exerciseId)
      .toArray(),
  ])

  const grouped = new Map<number, AccessorySet[]>()
  for (const set of accSets) {
    const list = grouped.get(set.sessionId)
    if (list) list.push(set)
    else grouped.set(set.sessionId, [set])
  }

  const notesBySession = new Map<number, string>()
  for (const note of accNotes) {
    notesBySession.set(note.sessionId, note.notes)
  }

  const out: ExerciseHistoryEntry[] = []
  for (const session of sessions) {
    const sets = grouped.get(session.id!)
    if (!sets || sets.length === 0) continue
    sets.sort((a, b) => a.setNumber - b.setNumber)
    out.push({
      date: session.date,
      sessionId: session.id!,
      sets,
      notes: notesBySession.get(session.id!) ?? null,
    })
  }

  out.sort((a, b) => b.date.getTime() - a.date.getTime())
  return out
}

export async function getLiftHistory(db: TrainingDB, liftId: number): Promise<LiftHistoryEntry[]> {
  // "What did I do last time" has to include this lift's cross work. The
  // session query used to match the lift's OWN sessions only, so a 315x5 cross
  // block logged on another lift's day was invisible here — while counting
  // toward the same lift's PR toast, Stats record and AMRAP seed. Ownership is
  // decided once, in baselineSets, which resolves cross work through whichever
  // session holds it.
  const { own, cross, sessionsById } = await baselineSets(db, liftId)
  if (sessionsById.size === 0) return []

  const grouped = new Map<number, Set[]>()
  for (const s of [...own, ...cross]) {
    // A session's own non-cross sets can belong to another movement entirely
    // when they carry an explicit liftId; keep only this lift's work.
    if (s.type !== 'cross' && s.liftId && s.liftId !== liftId) continue
    const list = grouped.get(s.sessionId)
    if (list) list.push(s)
    else grouped.set(s.sessionId, [s])
  }

  const sessions = [...sessionsById.values()]
    .filter(s => s.id != null && grouped.has(s.id))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const out: LiftHistoryEntry[] = []
  for (const session of sessions) {
    const sessionSets = grouped.get(session.id!)
    if (!sessionSets || sessionSets.length === 0) continue
    sessionSets.sort((a, b) => a.setNumber - b.setNumber)
    out.push({
      date: session.date,
      week: session.week,
      sets: sessionSets,
      notes: session.notes,
    })
  }

  return out
}

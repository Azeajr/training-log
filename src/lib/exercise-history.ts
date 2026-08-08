import type { TrainingDB } from '../db/index'
import type { AccessorySet } from '../types/domain'

export interface ExerciseHistoryEntry {
  date: Date
  sessionId: number
  sets: AccessorySet[]
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

import { db } from '../db/index'
import type {
  Lift, TrainingMax, AccessoryTrainingMax, Cycle, Session,
  Set, Exercise, LiftAccessory, AccessorySet, Settings,
} from '../types/domain'

const PENDING_EXPORT_KEY = 'pending-export'

export async function retryPendingExport(): Promise<void> {
  const pending = localStorage.getItem(PENDING_EXPORT_KEY)
  if (!pending) return
  try {
    const { content, filename } = JSON.parse(pending) as { content: string; filename: string }
    triggerDownload(content, filename, 'application/json')
    localStorage.removeItem(PENDING_EXPORT_KEY)
  } catch {
    // corrupt entry — clear it
    localStorage.removeItem(PENDING_EXPORT_KEY)
  }
}

export async function exportJson(): Promise<void> {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    lifts: await db.lifts.toArray(),
    trainingMaxes: await db.trainingMaxes.toArray(),
    accessoryTrainingMaxes: await db.accessoryTrainingMaxes.toArray(),
    cycles: await db.cycles.toArray(),
    sessions: await db.sessions.toArray(),
    sets: await db.sets.toArray(),
    exercises: await db.exercises.toArray(),
    liftAccessories: await db.liftAccessories.toArray(),
    accessorySets: await db.accessorySets.toArray(),
    settings: await db.settings.toArray(),
  }
  const content = JSON.stringify(data, null, 2)
  const filename = `training-log-${new Date().toISOString().split('T')[0]}.json`
  try {
    triggerDownload(content, filename, 'application/json')
  } catch {
    localStorage.setItem(PENDING_EXPORT_KEY, JSON.stringify({ content, filename }))
  }
}

export async function importJson(file: File): Promise<void> {
  const text = await file.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await importFromRawData(JSON.parse(text) as Record<string, any[]>)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importFromRawData(d: Record<string, any[]>): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.lifts, db.trainingMaxes, db.accessoryTrainingMaxes,
      db.cycles, db.sessions, db.sets,
      db.exercises, db.liftAccessories, db.accessorySets, db.settings,
    ],
    async () => {
      await db.lifts.clear()
      await db.trainingMaxes.clear()
      await db.cycles.clear()
      await db.sessions.clear()
      await db.sets.clear()
      await db.exercises.clear()
      await db.liftAccessories.clear()
      await db.settings.clear()

      if (d.lifts?.length)
        await db.lifts.bulkAdd(d.lifts as Lift[])
      if (d.trainingMaxes?.length)
        await db.trainingMaxes.bulkAdd(parseDates<TrainingMax>(d.trainingMaxes, ['setAt']))
      if (d.cycles?.length)
        await db.cycles.bulkAdd(parseDates<Cycle>(d.cycles, ['startDate', 'endDate']))
      if (d.sessions?.length)
        await db.sessions.bulkAdd(parseDates<Session>(d.sessions, ['date']))
      if (d.sets?.length)
        await db.sets.bulkAdd(d.sets as Set[])
      if (d.exercises?.length)
        await db.exercises.bulkAdd(d.exercises as Exercise[])
      if (d.liftAccessories?.length)
        await db.liftAccessories.bulkAdd(d.liftAccessories as LiftAccessory[])
      if (d.settings?.length)
        await db.settings.bulkAdd(d.settings as Settings[])

      // Only clear accessory tables when the key is present in the payload.
      // Old-format backups lack these keys; clearing without re-populating would silently wipe data.
      if ('accessoryTrainingMaxes' in d) {
        await db.accessoryTrainingMaxes.clear()
        if (d.accessoryTrainingMaxes?.length)
          await db.accessoryTrainingMaxes.bulkAdd(parseDates<AccessoryTrainingMax>(d.accessoryTrainingMaxes, ['setAt']))
      }
      if ('accessorySets' in d) {
        await db.accessorySets.clear()
        if (d.accessorySets?.length)
          await db.accessorySets.bulkAdd(d.accessorySets as AccessorySet[])
      }
    }
  )
}

export async function exportCsv(): Promise<void> {
  const sessions = await db.sessions.toArray()
  const sets = await db.sets.toArray()
  const lifts = await db.lifts.toArray()
  const accessorySets = await db.accessorySets.toArray()
  const exercises = await db.exercises.toArray()
  const liftMap = Object.fromEntries(lifts.map(l => [l.id!, l.name]))
  const exerciseMap = Object.fromEntries(exercises.map(e => [e.id!, e.name]))

  const rows: string[][] = [
    ['date', 'lift', 'week', 'type', 'set_number', 'weight_lb', 'reps', 'is_amrap', 'session_notes', 'exercise_name'],
  ]

  for (const session of sessions) {
    if (session.status !== 'completed') continue
    const sessionSets = sets.filter(s => s.sessionId === session.id)
    const sessionAccessorySets = accessorySets.filter(a => a.sessionId === session.id)
    const dateStr = new Date(session.date).toISOString().split('T')[0]
    const liftName = liftMap[session.liftId] ?? String(session.liftId)

    if (sessionSets.length === 0 && sessionAccessorySets.length === 0) {
      rows.push([dateStr, liftName, String(session.week), '', '', '', '', '', session.notes ?? '', ''])
    } else {
      for (const s of sessionSets) {
        rows.push([
          dateStr,
          liftName,
          String(session.week),
          s.type,
          String(s.setNumber),
          String(s.weight),
          String(s.reps),
          s.isAmrap ? 'true' : 'false',
          session.notes ?? '',
          '',
        ])
      }
      for (const a of sessionAccessorySets) {
        rows.push([
          dateStr,
          liftName,
          String(session.week),
          'accessory',
          String(a.setNumber),
          a.weight != null ? String(a.weight) : '',
          a.reps != null ? String(a.reps) : '',
          'false',
          session.notes ?? '',
          exerciseMap[a.exerciseId] ?? String(a.exerciseId),
        ])
      }
    }
  }

  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  triggerDownload(
    csv,
    `training-log-history-${new Date().toISOString().split('T')[0]}.csv`,
    'text/csv'
  )
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDates<T>(rows: any[], fields: string[]): T[] {
  return rows.map(row => {
    const copy = { ...row }
    for (const f of fields) {
      if (copy[f] != null) copy[f] = new Date(copy[f] as string)
    }
    return copy as T
  })
}

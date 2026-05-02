import { db } from '../db/db'
import type {
  Lift, TrainingMax, AccessoryTrainingMax, Cycle, Session,
  Set, Exercise, LiftAccessory, AccessorySet, Settings,
} from '../db/db'

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
  triggerDownload(
    JSON.stringify(data, null, 2),
    `training-log-${new Date().toISOString().split('T')[0]}.json`,
    'application/json'
  )
}

export async function importJson(file: File): Promise<void> {
  const text = await file.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = JSON.parse(text) as Record<string, any[]>

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
      await db.accessoryTrainingMaxes.clear()
      await db.cycles.clear()
      await db.sessions.clear()
      await db.sets.clear()
      await db.exercises.clear()
      await db.liftAccessories.clear()
      await db.accessorySets.clear()
      await db.settings.clear()

      if (d.lifts?.length)
        await db.lifts.bulkAdd(d.lifts as Lift[])
      if (d.trainingMaxes?.length)
        await db.trainingMaxes.bulkAdd(parseDates<TrainingMax>(d.trainingMaxes, ['setAt']))
      if (d.accessoryTrainingMaxes?.length)
        await db.accessoryTrainingMaxes.bulkAdd(parseDates<AccessoryTrainingMax>(d.accessoryTrainingMaxes, ['setAt']))
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
      if (d.accessorySets?.length)
        await db.accessorySets.bulkAdd(d.accessorySets as AccessorySet[])
      if (d.settings?.length)
        await db.settings.bulkAdd(d.settings as Settings[])
    }
  )
}

export async function exportCsv(): Promise<void> {
  const sessions = await db.sessions.toArray()
  const sets = await db.sets.toArray()
  const lifts = await db.lifts.toArray()
  const liftMap = Object.fromEntries(lifts.map(l => [l.id!, l.name]))

  const rows: string[][] = [
    ['date', 'lift', 'week', 'type', 'set_number', 'weight_lb', 'reps', 'is_amrap', 'session_notes'],
  ]

  for (const session of sessions) {
    if (session.status !== 'completed') continue
    const sessionSets = sets.filter(s => s.sessionId === session.id)
    const dateStr = new Date(session.date).toISOString().split('T')[0]
    const liftName = liftMap[session.liftId] ?? String(session.liftId)

    if (sessionSets.length === 0) {
      rows.push([dateStr, liftName, String(session.week), '', '', '', '', '', session.notes ?? ''])
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

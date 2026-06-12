import type { TrainingDB } from '../db/index'
import type {
  Lift, TrainingMax, AccessoryTrainingMax, Cycle, Session,
  Set, Exercise, LiftAccessory, AccessorySet, Settings,
} from '../types/domain'
import { formatDateIso } from './format'

const PENDING_EXPORT_KEY = 'pending-export'
// Cap import payloads before `file.text()` materializes them — a multi-GB JSON
// would otherwise be slurped into a single string and OOM the renderer.
// 50 MB is ~10x larger than any realistic full-history export.
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024

export async function retryPendingExport(): Promise<void> {
  const pending = localStorage.getItem(PENDING_EXPORT_KEY)
  if (!pending) return
  try {
    const { content, filename } = JSON.parse(pending) as { content: string; filename: string }
    triggerDownload(content, filename, 'application/json')
    localStorage.removeItem(PENDING_EXPORT_KEY)
  } catch {
    localStorage.removeItem(PENDING_EXPORT_KEY)
  }
}

export async function exportJson(db: TrainingDB): Promise<void> {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 2,
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
  const filename = `training-log-${formatDateIso(new Date())}.json`
  try {
    triggerDownload(content, filename, 'application/json')
  } catch {
    localStorage.setItem(PENDING_EXPORT_KEY, JSON.stringify({ content, filename }))
  }
}

export async function importJson(db: TrainingDB, file: File): Promise<void> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`Import file too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`)
  }
  const text = await file.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: Record<string, any>
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsed = JSON.parse(text) as Record<string, any>
  } catch {
    throw new Error('Invalid JSON file')
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid backup format: expected JSON object')
  }
  await importFromRawData(db, parsed)
}

// Allowlist of columns per table. Anything else in the imported payload is
// dropped before bulkAdd — pairs with the assertIdent guard in sqlite-table:
// the guard prevents bad keys from reaching the INSERT, this layer just
// gives a friendlier "ignore unknown column" experience for legacy backups.
const COLS = {
  lifts: ['id', 'name', 'order', 'progressionIncrement', 'baseWeight', 'liftType'],
  trainingMaxes: ['id', 'liftId', 'weight', 'setAt'],
  cycles: ['id', 'number', 'startDate', 'endDate'],
  sessions: ['id', 'cycleId', 'liftId', 'week', 'date', 'notes', 'status'],
  sets: ['id', 'sessionId', 'type', 'setNumber', 'weight', 'reps', 'isAmrap'],
  exercises: ['id', 'name', 'type', 'archived'],
  liftAccessories: ['id', 'liftId', 'exerciseId', 'order'],
  accessoryTrainingMaxes: ['id', 'exerciseId', 'weight', 'incrementLb', 'setAt'],
  accessorySets: ['id', 'sessionId', 'exerciseId', 'setNumber', 'weight', 'reps', 'duration', 'distance'],
  settings: ['id', 'restTimer1', 'restTimer2', 'restTimerFail', 'theme', 'barWeight', 'plates', 'supplementalTemplate'],
} as const

// Reject malformed table payloads BEFORE the destructive clear. Without this,
// a non-array table value either crashed mid-transaction with a raw TypeError
// (string: truthy .length) or — worse — silently skipped the bulkAdd after
// clear() had run (number/object: no .length), erasing the table while the
// import "succeeded". Duplicate ids surfaced as a raw UNIQUE-constraint SQL
// error. SQLite coerces numeric-string rowids, so ids are compared as strings.
function validateImportShape(d: Record<string, unknown>): void {
  for (const name of Object.keys(COLS) as (keyof typeof COLS)[]) {
    const rows = d[name]
    if (rows == null) continue
    if (!Array.isArray(rows)) throw new Error(`Invalid backup: "${name}" must be an array`)
    const seen = new Set<string>()
    for (const row of rows) {
      if (row == null || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Invalid backup: "${name}" contains a non-object entry`)
      }
      const id = (row as Record<string, unknown>).id
      if (id == null) continue
      const key = String(id)
      if (seen.has(key)) throw new Error(`Invalid backup: duplicate id ${key} in "${name}"`)
      seen.add(key)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importFromRawData(db: TrainingDB, d: Record<string, any>): Promise<void> {
  validateImportShape(d)
  await db.transaction(
    async () => {
      await db.lifts.clear()
      await db.trainingMaxes.clear()
      await db.cycles.clear()
      await db.sessions.clear()
      await db.sets.clear()
      await db.exercises.clear()
      await db.liftAccessories.clear()
      await db.accessoryTrainingMaxes.clear()
      await db.accessorySets.clear()
      await db.settings.clear()

      if (d.lifts?.length)
        await db.lifts.bulkAdd(pickCols<Lift>(d.lifts, COLS.lifts))
      if (d.trainingMaxes?.length)
        await db.trainingMaxes.bulkAdd(parseDates<TrainingMax>(pickCols(d.trainingMaxes, COLS.trainingMaxes), ['setAt']))
      if (d.cycles?.length)
        await db.cycles.bulkAdd(parseDates<Cycle>(pickCols(d.cycles, COLS.cycles), ['startDate', 'endDate']))
      if (d.sessions?.length)
        await db.sessions.bulkAdd(parseDates<Session>(pickCols(d.sessions, COLS.sessions), ['date']))
      if (d.sets?.length)
        await db.sets.bulkAdd(pickCols<Set>(d.sets, COLS.sets))
      if (d.exercises?.length)
        await db.exercises.bulkAdd(pickCols<Exercise>(d.exercises, COLS.exercises))
      if (d.liftAccessories?.length)
        await db.liftAccessories.bulkAdd(pickCols<LiftAccessory>(d.liftAccessories, COLS.liftAccessories))
      if (d.settings?.length)
        await db.settings.bulkAdd(pickCols<Settings>(d.settings, COLS.settings))
      if (d.accessoryTrainingMaxes?.length)
        await db.accessoryTrainingMaxes.bulkAdd(parseDates<AccessoryTrainingMax>(pickCols(d.accessoryTrainingMaxes, COLS.accessoryTrainingMaxes), ['setAt']))
      if (d.accessorySets?.length)
        await db.accessorySets.bulkAdd(pickCols<AccessorySet>(d.accessorySets, COLS.accessorySets))
    }
  )
}

export async function exportCsv(db: TrainingDB): Promise<void> {
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
    const dateStr = formatDateIso(session.date)
    const liftName = liftMap[session.liftId] ?? String(session.liftId)

    if (sessionSets.length === 0 && sessionAccessorySets.length === 0) {
      rows.push([dateStr, liftName, String(session.week), '', '', '', '', '', session.notes ?? '', ''])
    } else {
      for (const s of sessionSets) {
        rows.push([
          dateStr, liftName, String(session.week), s.type, String(s.setNumber),
          String(s.weight), String(s.reps), s.isAmrap ? 'true' : 'false', session.notes ?? '', '',
        ])
      }
      for (const a of sessionAccessorySets) {
        rows.push([
          dateStr, liftName, String(session.week), 'accessory', String(a.setNumber),
          a.weight != null ? String(a.weight) : '', a.reps != null ? String(a.reps) : '',
          'false', session.notes ?? '', exerciseMap[a.exerciseId] ?? String(a.exerciseId),
        ])
      }
    }
  }

  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  triggerDownload(
    csv,
    `training-log-history-${formatDateIso(new Date())}.csv`,
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

function pickCols<T>(rows: Record<string, unknown>[], cols: readonly string[]): T[] {
  const colSet = new Set<string>(cols)
  return rows.map(row =>
    Object.fromEntries(Object.entries(row).filter(([k]) => colSet.has(k))) as unknown as T
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDates<T>(rows: any[], fields: readonly string[]): T[] {
  return rows.map(row => {
    const copy = { ...row }
    for (const f of fields) {
      if (copy[f] != null) copy[f] = new Date(copy[f] as string)
    }
    return copy as T
  })
}

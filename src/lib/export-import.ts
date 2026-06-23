import type { TrainingDB } from '../db/index'
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
    liftSupplementals: await db.liftSupplementals.toArray(),
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
  lifts: ['id', 'name', 'order', 'progressionIncrement', 'baseWeight', 'liftType', 'archived'],
  trainingMaxes: ['id', 'liftId', 'weight', 'setAt'],
  cycles: ['id', 'number', 'startDate', 'endDate', 'closedThroughWeek'],
  sessions: ['id', 'cycleId', 'liftId', 'week', 'date', 'notes', 'status'],
  sets: ['id', 'sessionId', 'type', 'setNumber', 'weight', 'reps', 'isAmrap', 'liftId'],
  exercises: ['id', 'name', 'type', 'archived'],
  liftAccessories: ['id', 'liftId', 'exerciseId', 'order'],
  liftSupplementals: ['id', 'liftId', 'movementLiftId', 'weightMode', 'percent', 'sets', 'reps', 'order'],
  accessoryTrainingMaxes: ['id', 'exerciseId', 'weight', 'incrementLb', 'setAt'],
  accessorySets: ['id', 'sessionId', 'exerciseId', 'setNumber', 'weight', 'reps', 'duration', 'distance'],
  settings: ['id', 'restTimer1', 'restTimer2', 'restTimerFail', 'theme', 'barWeight', 'plates', 'supplementalTemplate', 'deloadSupplemental'],
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

// One row per importable table: the destination table, its column allowlist,
// and which of those columns are date strings to revive. Driving clear() and
// bulkAdd() off this single list keeps the destructive wipe and the restore in
// lockstep — adding a table is one entry here, not three edits across a clear
// block, an if-chain, and COLS that can silently drift apart.
// bulkAdd takes any[] so the heterogeneous SQLiteTable<T> instances (each with a
// concrete row type) all satisfy one spec entry shape under strict variance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImportTable = { clear(): Promise<void>; bulkAdd(items: any[]): Promise<void> }
interface ImportTableSpec { key: keyof typeof COLS; table: ImportTable; dates: readonly string[] }

function importSpec(db: TrainingDB): ImportTableSpec[] {
  return [
    { key: 'lifts',                  table: db.lifts,                  dates: [] },
    { key: 'trainingMaxes',          table: db.trainingMaxes,          dates: ['setAt'] },
    { key: 'cycles',                 table: db.cycles,                 dates: ['startDate', 'endDate'] },
    { key: 'sessions',               table: db.sessions,               dates: ['date'] },
    { key: 'sets',                   table: db.sets,                   dates: [] },
    { key: 'exercises',              table: db.exercises,              dates: [] },
    { key: 'liftAccessories',        table: db.liftAccessories,        dates: [] },
    { key: 'liftSupplementals',      table: db.liftSupplementals,      dates: [] },
    { key: 'accessoryTrainingMaxes', table: db.accessoryTrainingMaxes, dates: ['setAt'] },
    { key: 'accessorySets',          table: db.accessorySets,          dates: [] },
    { key: 'settings',               table: db.settings,               dates: [] },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importFromRawData(db: TrainingDB, d: Record<string, any>): Promise<void> {
  validateImportShape(d)
  const spec = importSpec(db)
  await db.transaction(async () => {
    // Clear every table first — the import is destructive regardless of which
    // tables the payload includes.
    for (const { table } of spec) await table.clear()
    // Then restore only the tables present in the payload.
    for (const { key, table, dates } of spec) {
      const rows = d[key]
      if (rows?.length) await table.bulkAdd(parseDates<Record<string, unknown>>(pickCols(rows, COLS[key]), dates))
    }
  })
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

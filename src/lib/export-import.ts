import { bandsLabel, clearSeededBandProfiles, legacyBandFields, reconcileBandInventory, upgradeBandLoad, validBandInventory, validBandLoad, validBandProfile } from './band-loading'
import type { BandLoad } from '../types/domain'
import type { TrainingDB } from '../db/index'
import type { PtExercise, PtSetCheck } from '../types/domain'
import { ptCheckActuals } from './pt'
import { formatDateIso, formatTimeIso } from './format'
import { refreshTrainingMaxPresence } from './training-max'

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
  // Fanned out, not awaited in sequence: each toArray() is its own round-trip to
  // the SQLite worker and none of them depends on another, so awaiting them one
  // at a time paid the latency once per table for no ordering benefit.
  const [
    lifts, trainingMaxes, accessoryTrainingMaxes, cycles, sessions, sets,
    exercises, liftSupplementals, accessorySets, accessoryNotes,
    assistanceDefaults, settingsRows,
    ptRoutines, ptExercises, ptSessions, ptSetChecks, ptNotes,
  ] = await Promise.all([
    db.lifts.toArray(),
    db.trainingMaxes.toArray(),
    db.accessoryTrainingMaxes.toArray(),
    db.cycles.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.liftSupplementals.toArray(),
    db.accessorySets.toArray(),
    db.accessoryNotes.toArray(),
    db.assistanceDefaults.toArray(),
    db.settings.toArray(),
    db.ptRoutines.toArray(),
    db.ptExercises.toArray(),
    db.ptSessions.toArray(),
    db.ptSetChecks.toArray(),
    db.ptNotes.toArray(),
  ])
  const data = {
    exportedAt: new Date().toISOString(),
    version: 2,
    lifts,
    trainingMaxes,
    accessoryTrainingMaxes,
    cycles,
    sessions,
    sets,
    exercises,
    liftSupplementals,
    accessorySets,
    accessoryNotes,
    assistanceDefaults,
    settings: settingsRows,
    ptRoutines,
    ptExercises,
    ptSessions,
    ptSetChecks,
    ptNotes,
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
  lifts: ['id', 'name', 'order', 'progressionIncrement', 'baseWeight', 'liftType', 'archived', 'usesBarbell', 'plateMode', 'implementBase', 'bandProfile'],
  trainingMaxes: ['id', 'liftId', 'weight', 'setAt', 'source', 'cycleId'],
  cycles: ['id', 'number', 'startDate', 'endDate', 'closedThroughWeek'],
  sessions: ['id', 'cycleId', 'liftId', 'week', 'date', 'notes', 'status'],
  sets: ['id', 'sessionId', 'type', 'setNumber', 'weight', 'reps', 'isAmrap', 'liftId', 'bandLoad'],
  exercises: ['id', 'name', 'type', 'category', 'archived', 'usesBarbell', 'plateMode', 'implementBase', 'bandProfile'],
  liftSupplementals: ['id', 'liftId', 'movementLiftId', 'weightMode', 'percent', 'sets', 'reps', 'order'],
  accessoryTrainingMaxes: ['id', 'exerciseId', 'weight', 'incrementLb', 'setAt'],
  accessorySets: ['id', 'sessionId', 'exerciseId', 'setNumber', 'weight', 'reps', 'duration', 'distance', 'dropRounds', 'bandLoad'],
  accessoryNotes: ['id', 'sessionId', 'exerciseId', 'notes'],
  assistanceDefaults: ['id', 'liftId', 'section', 'exerciseId'],
  // `hasDeloadWeek` belongs here: it was missing, so an import dropped it and
  // the restored null defaulted to enabled — silently turning a three-week
  // cycle into a four-week one, which is the shape the whole program hangs off.
  ptRoutines: ['id', 'name', 'notes', 'order', 'archived'],
  ptExercises: ['id', 'routineId', 'name', 'description', 'videoUrl', 'sets', 'measure', 'targetReps', 'targetSeconds', 'targetDistance', 'distanceUnit', 'resistanceKind', 'resistanceWeight', 'resistanceBand', 'equipmentHeight', 'equipmentHeightUnit', 'order', 'archived'],
  ptSessions: ['id', 'routineId', 'date', 'notes'],
  // `measure` and `resistanceKind` belong here beside the actuals: they say what
  // those eight values MEAN, and a restore that dropped them would hand every
  // set back to the current prescription to interpret.
  ptSetChecks: ['id', 'sessionId', 'ptExerciseId', 'setNumber', 'done', 'reps', 'seconds', 'distance', 'distanceUnit', 'weight', 'band', 'equipmentHeight', 'equipmentHeightUnit', 'recorded', 'measure', 'resistanceKind'],
  ptNotes: ['id', 'sessionId', 'ptExerciseId', 'notes'],
  settings: ['id', 'restTimer1', 'restTimer2', 'restTimerFail', 'theme', 'barWeight', 'plates', 'supplementalTemplate', 'deloadSupplemental', 'highRepDiscount', 'restTimerNotifications', 'hasDeloadWeek', 'bands'],
} as const

// Reject malformed table payloads BEFORE the destructive clear. Without this,
// a non-array table value either crashed mid-transaction with a raw TypeError
// (string: truthy .length) or — worse — silently skipped the bulkAdd after
// clear() had run (number/object: no .length), erasing the table while the
// import "succeeded". Duplicate ids surfaced as a raw UNIQUE-constraint SQL
// error. SQLite coerces numeric-string rowids, so ids are compared as strings.
function validateImportShape(d: Record<string, unknown>): void {
  // Establish that this IS a backup before anything destructive runs. The loop
  // below only inspects tables that are present, so a document carrying none of
  // them — an unrelated JSON file, or an empty object — passed validation
  // completely, and the import then cleared every table and restored nothing.
  // Settings does ask the user to confirm an overwrite, but it was asking about
  // a file never established to be a backup at all.
  //
  // One recognised table is the bar, deliberately: a backup taken before a
  // later table existed is still a backup, and a legacy file must keep
  // importing. What is rejected is a file with no recognised table at all.
  const present = (Object.keys(COLS) as (keyof typeof COLS)[]).filter(
    (name) => d[name] != null,
  )
  if (present.length === 0) {
    throw new Error(
      'Invalid backup: no recognised tables. Expected a training-log export ' +
        `containing at least one of: ${Object.keys(COLS).join(', ')}.`,
    )
  }

  for (const name of Object.keys(COLS) as (keyof typeof COLS)[]) {
    const rows = d[name]
    if (rows == null) continue
    if (!Array.isArray(rows)) throw new Error(`Invalid backup: "${name}" must be an array`)
    const seen = new Set<string>()
    for (const row of rows) {
      if (row == null || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Invalid backup: "${name}" contains a non-object entry`)
      }
      const r = row as Record<string, unknown>
      // `week` is the one column the whole program hangs percentage lookups
      // off, and it is read straight back out of these rows. Out of range it
      // used to reach `calcMainSets` and blank the Workout screen (F28). The
      // calc lookups are total now, but a session in a week the cycle does not
      // have is still corrupt — and rejecting here, before the destructive
      // clear, leaves the user's existing data untouched.
      if (name === 'sessions' && r.week != null) {
        const week = Number(r.week)
        if (!Number.isInteger(week) || week < 1 || week > 4) {
          throw new Error(`Invalid backup: "sessions" has a week of ${String(r.week)}; expected 1-4`)
        }
      }
      if (name === 'accessorySets' && r.dropRounds != null) {
        if (!Array.isArray(r.dropRounds) || r.dropRounds.some(round =>
          round == null || typeof round !== 'object' ||
          !Number.isFinite(round.weight) || !Number.isInteger(round.reps) || round.reps < 0
        )) {
          throw new Error('Invalid backup: accessory drop rounds require finite weights and nonnegative integer reps')
        }
      }
      // Band names key every calibration, so the list they come from is held to
      // the same standard as the calibrations themselves.
      if (name === 'settings' && r.bands != null && !validBandInventory(r.bands)) {
        throw new Error('Invalid backup: invalid band inventory')
      }
      if ((name === 'lifts' || name === 'exercises') && r.bandProfile != null && !validBandProfile(r.bandProfile)) {
        throw new Error('Invalid backup: invalid band calibration')
      }
      // Judged as they will be stored: a backup from before bands stacked names
      // one `band`, and `importFromRawData` upgrades it on the way in.
      if ((name === 'sets' || name === 'accessorySets') && r.bandLoad != null && !validBandLoad(upgradeBandLoad(r.bandLoad))) {
        throw new Error('Invalid backup: invalid band load')
      }
      if (name === 'accessorySets' && Array.isArray(r.dropRounds) && r.dropRounds.some(round => round.bandLoad != null && !validBandLoad(upgradeBandLoad(round.bandLoad)))) {
        throw new Error('Invalid backup: invalid drop-round band load')
      }
      const id = r.id
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
    { key: 'liftSupplementals',      table: db.liftSupplementals,      dates: [] },
    { key: 'accessoryTrainingMaxes', table: db.accessoryTrainingMaxes, dates: ['setAt'] },
    { key: 'accessorySets',          table: db.accessorySets,          dates: [] },
    { key: 'accessoryNotes',         table: db.accessoryNotes,         dates: [] },
    { key: 'assistanceDefaults',     table: db.assistanceDefaults,     dates: [] },
    { key: 'settings',               table: db.settings,               dates: [] },
    { key: 'ptRoutines',             table: db.ptRoutines,             dates: [] },
    { key: 'ptExercises',            table: db.ptExercises,            dates: [] },
    { key: 'ptSessions',             table: db.ptSessions,             dates: ['date'] },
    { key: 'ptSetChecks',            table: db.ptSetChecks,            dates: [] },
    { key: 'ptNotes',                table: db.ptNotes,                dates: [] },
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
      if (!rows?.length) continue
      let parsed = parseDates<Record<string, unknown>>(pickCols(rows, COLS[key]), dates)
      // Migrate the legacy 'single_leg' category to 'legs' so importing an old
      // backup lands on the current tag set (mirrors the boot-time seed migration).
      if (key === 'exercises') {
        parsed = parsed.map(r => r.category === 'single_leg' ? { ...r, category: 'legs' } : r)
      }
      // One `band` to a list of `bands`, mirroring the boot-time upgrade.
      if (key === 'sets' || key === 'accessorySets') {
        parsed = parsed.map(r => ({ ...r, ...legacyBandFields(r) }))
      }
      // One cross-lift block per (lift, movement) — the same invariant the
      // migration establishes. A backup taken before that index existed can
      // carry duplicates, and restoring them verbatim is how they got in
      // (F31). Reconciled rather than rejected: the rest of the backup is
      // perfectly good, and the surviving block still owns every set logged
      // against that movement.
      if (key === 'liftSupplementals') {
        const seen = new Set<string>()
        parsed = parsed.filter(r => {
          const slot = `${String(r.liftId)}:${String(r.movementLiftId)}`
          if (seen.has(slot)) return false
          seen.add(slot)
          return true
        })
      }
      await table.bulkAdd(parsed)
    }
  })
  // The only path that can take training maxes away — every table is cleared
  // before the restore, and the payload may carry none. Re-derive rather than
  // assume, so a backup with no TMs correctly sends the user back to /setup.
  await refreshTrainingMaxPresence(db)
  // Outside the transaction above: `db.transaction` is a serial queue and a
  // nested call deadlocks.
  //
  // A backup taken from a database that ran the seeding build carries the
  // profiles that build wrote, so restoring it verbatim puts band loading back
  // on for anything spelled like a chin-up — and the undo lives in `seed()`,
  // which does not run again until the app is reloaded. Importing your own
  // backup therefore took the weight stepper away for the rest of the session.
  // The same reasoning as the 'single_leg' migration above: a seed fixup has
  // to run wherever rows arrive, not only at boot. Byte-identical rows only,
  // so a profile the user saved is still theirs.
  await clearSeededBandProfiles(db)
  // A backup from before the inventory has calibrations and no inventory, and
  // one from after may name a band its inventory lacks. Either way, after the
  // seed undo, so a profile it clears lends no names to the equipment.
  await reconcileBandInventory(db)
}

export async function exportCsv(db: TrainingDB): Promise<void> {
  // Same fan-out as exportJson — six independent worker round-trips.
  const [sessions, sets, lifts, accessorySets, accessoryNotes, exercises] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.lifts.toArray(),
    db.accessorySets.toArray(),
    db.accessoryNotes.toArray(),
    db.exercises.toArray(),
  ])
  const liftMap = Object.fromEntries(lifts.map(l => [l.id!, l.name]))
  const exerciseMap = Object.fromEntries(exercises.map(e => [e.id!, e.name]))

  const rows: string[][] = [
    // duration_s and distance_m are here because a timed or distance accessory
    // records its performance in neither weight nor reps — a plank and a
    // farmer's walk exported as blank columns, so the CSV silently discarded
    // the only measurement they had (F09).
    ['date', 'lift', 'week', 'type', 'set_number', 'weight_lb', 'reps', 'duration_s', 'distance_m', 'is_amrap', 'session_notes', 'exercise_name', 'accessory_notes'],
  ]

  const hasBands = sets.some(s => s.bandLoad) || accessorySets.some(s => s.bandLoad || s.dropRounds?.some(r => r.bandLoad))
  if (hasBands) rows[0].push('band', 'raw_load_lb', 'band_assistance_lb', 'added_weight_lb')
  const bandColumns = (load?: BandLoad | null): string[] => !hasBands ? [] : load
    ? [bandsLabel(load.bands) || 'None', String(load.rawLoad), String(load.assistance), String(load.addedWeight)]
    : ['', '', '', '']

  for (const session of sessions) {
    if (session.status !== 'completed') continue
    const sessionSets = sets.filter(s => s.sessionId === session.id)
    const sessionAccessorySets = accessorySets.filter(a => a.sessionId === session.id)
    const notesByExercise = new Map(
      accessoryNotes.filter(n => n.sessionId === session.id).map(n => [n.exerciseId, n.notes])
    )
    const dateStr = formatDateIso(session.date)
    const liftName = liftMap[session.liftId] ?? String(session.liftId)

    if (sessionSets.length === 0 && sessionAccessorySets.length === 0 && notesByExercise.size === 0) {
      rows.push([dateStr, liftName, String(session.week), '', '', '', '', '', '', '', session.notes ?? '', '', ''])
    } else {
      for (const s of sessionSets) {
        rows.push([
          dateStr, liftName, String(session.week), s.type, String(s.setNumber),
          String(s.weight), String(s.reps), '', '',
          s.isAmrap ? 'true' : 'false', session.notes ?? '', '', '', ...bandColumns(s.bandLoad),
        ])
      }
      for (const a of sessionAccessorySets) {
        rows.push([
          dateStr, liftName, String(session.week), 'accessory', String(a.setNumber),
          a.weight != null ? String(a.weight) : '', a.reps != null ? String(a.reps) : '',
          a.duration != null ? String(a.duration) : '', a.distance != null ? String(a.distance) : '',
          'false', session.notes ?? '', exerciseMap[a.exerciseId] ?? String(a.exerciseId),
          notesByExercise.get(a.exerciseId) ?? '', ...bandColumns(a.bandLoad),
        ])
        for (const round of a.dropRounds ?? []) {
          rows.push([
            dateStr, liftName, String(session.week), 'accessory_drop', String(a.setNumber),
            String(round.weight), String(round.reps), '', '', 'false',
            session.notes ?? '', exerciseMap[a.exerciseId] ?? String(a.exerciseId), '', ...bandColumns(round.bandLoad),
          ])
        }
      }
      // A note-only accessory (no logged sets) still gets a row — otherwise
      // its note would exist in the JSON backup but silently vanish from CSV.
      for (const [exId, note] of notesByExercise) {
        if (sessionAccessorySets.some(a => a.exerciseId === exId)) continue
        rows.push([
          dateStr, liftName, String(session.week), 'accessory', '', '', '', '', '',
          'false', session.notes ?? '', exerciseMap[exId] ?? String(exId), note,
        ])
      }
    }
  }

  if (hasBands) for (const row of rows) while (row.length < rows[0].length) row.push('')
  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  triggerDownload(
    csv,
    `training-log-history-${formatDateIso(new Date())}.csv`,
    'text/csv'
  )
}

/**
 * PT runs as their own CSV.
 *
 * A separate file rather than extra rows in `exportCsv`: that sheet is shaped
 * around a 5/3/1 session — lift, week, weight, is_amrap — and a PT check has
 * none of those. Forcing them in means a dozen permanently blank columns on
 * every row and a `lift` column holding a routine name, which is exactly the
 * sort of overloading that makes a spreadsheet lie. The prescription is
 * repeated on each row because a spreadsheet has no joins: filtering to one
 * exercise has to carry what that exercise asked for.
 */
export async function exportPtCsv(db: TrainingDB): Promise<void> {
  const [sessions, checks, notes, routines, exercises] = await Promise.all([
    db.ptSessions.toArray(),
    db.ptSetChecks.toArray(),
    db.ptNotes.toArray(),
    db.ptRoutines.toArray(),
    db.ptExercises.toArray(),
  ])

  const routineName = new Map(routines.map(r => [r.id!, r.name]))
  const exerciseById = new Map(exercises.map(e => [e.id!, e]))
  const noteByKey = new Map(notes.map(n => [`${n.sessionId}:${n.ptExerciseId}`, n.notes]))
  const checksBySession = new Map<number, typeof checks>()
  for (const check of checks) {
    const bucket = checksBySession.get(check.sessionId)
    if (bucket) bucket.push(check)
    else checksBySession.set(check.sessionId, [check])
  }

  const rows: string[][] = [[
    // `time` because a routine can be run several times in a day, and by date
    // alone those runs cannot be told apart.
    'date', 'time', 'routine', 'exercise', 'set_number', 'done', 'measure',
    'target_reps', 'target_seconds', 'target_distance', 'distance_unit',
    'resistance_kind', 'resistance_weight_lb', 'resistance_band',
    'exercise_notes', 'session_notes',
    'equipment_height', 'equipment_height_unit',
    // What the set actually was, beside what it was prescribed to be. Without
    // these the sheet reads every set back off the CURRENT prescription, so a
    // routine edited since would rewrite its own history in the export, and a
    // set done on a taller box would be indistinguishable from one that wasn't.
    'actual_reps', 'actual_seconds', 'actual_distance', 'actual_distance_unit',
    'actual_weight_lb', 'actual_band', 'actual_equipment_height', 'actual_equipment_height_unit',
  ]]

  // Chronological, then by the routine's own exercise order, then set number —
  // the order the work was actually done in, which is what a reader scanning
  // the sheet expects. The table's insertion order is none of those.
  const ordered = [...sessions].sort((a, b) => a.date.getTime() - b.date.getTime())
  for (const session of ordered) {
    const dateStr = formatDateIso(session.date)
    const timeStr = formatTimeIso(session.date)
    const name = routineName.get(session.routineId) ?? String(session.routineId)
    const sessionChecks = (checksBySession.get(session.id!) ?? []).slice().sort((a, b) => {
      const orderA = exerciseById.get(a.ptExerciseId)?.order ?? 0
      const orderB = exerciseById.get(b.ptExerciseId)?.order ?? 0
      return orderA - orderB || a.setNumber - b.setNumber
    })

    // A run with no checks still gets a row: its date and any session note are
    // the only record that it happened, and dropping it would make the sheet
    // disagree with the history list about how many runs there were.
    if (sessionChecks.length === 0) {
      // Positional, so it has to grow with the header above — a short row here
      // is what makes every later column slip one to the left.
      const blanks = rows[0].length - 3
      rows.push([dateStr, timeStr, name, ...Array<string>(blanks).fill('')])
      rows[rows.length - 1][rows[0].indexOf('session_notes')] = session.notes ?? ''
      continue
    }

    for (const check of sessionChecks) {
      const exercise = exerciseById.get(check.ptExerciseId)
      rows.push([
        dateStr,
        timeStr,
        name,
        exercise?.name ?? String(check.ptExerciseId),
        String(check.setNumber),
        check.done ? 'true' : 'false',
        exercise?.measure ?? '',
        exercise?.targetReps != null ? String(exercise.targetReps) : '',
        exercise?.targetSeconds != null ? String(exercise.targetSeconds) : '',
        exercise?.targetDistance != null ? String(exercise.targetDistance) : '',
        exercise?.distanceUnit ?? '',
        exercise?.resistanceKind ?? '',
        exercise?.resistanceWeight != null ? String(exercise.resistanceWeight) : '',
        exercise?.resistanceBand ?? '',
        noteByKey.get(`${session.id!}:${check.ptExerciseId}`) ?? '',
        session.notes ?? '',
        exercise?.equipmentHeight != null ? String(exercise.equipmentHeight) : '',
        exercise?.equipmentHeightUnit ?? '',
        ...actualCells(check, exercise),
      ])
    }
  }

  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  triggerDownload(csv, `training-log-pt-${formatDateIso(new Date())}.csv`, 'text/csv')
}

/**
 * The eight actual_* cells for one recorded set.
 *
 * Read through `ptCheckActuals`: a recorded row exports exactly what it stored,
 * and a row written before PT recorded anything but a tick still exports the
 * prescription it was done under rather than eight blanks. An orphaned check whose exercise no longer resolves has
 * nothing to resolve against and exports what it stored, or nothing.
 */
function actualCells(check: PtSetCheck, exercise: PtExercise | undefined): string[] {
  const actuals = exercise ? ptCheckActuals(check, exercise) : check
  const text = (v: number | string | null | undefined) => v == null ? '' : String(v)
  return [
    text(actuals.reps), text(actuals.seconds), text(actuals.distance), text(actuals.distanceUnit),
    text(actuals.weight), text(actuals.band), text(actuals.equipmentHeight), text(actuals.equipmentHeightUnit),
  ]
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

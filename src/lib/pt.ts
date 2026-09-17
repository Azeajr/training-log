import type { TrainingDB } from '../db/index'
import type {
  PtDistanceUnit,
  PtExercise,
  PtMeasure,
  PtNote,
  PtResistanceKind,
  PtRoutine,
  PtSession,
  PtSetCheck,
} from '../types/domain'
import { formatDuration } from './calc'

export const PT_MEASURES = ['reps', 'time', 'distance'] as const satisfies readonly PtMeasure[]
export const PT_DISTANCE_UNITS = ['yd', 'm', 'ft'] as const satisfies readonly PtDistanceUnit[]
export const PT_RESISTANCE_KINDS = ['none', 'weight', 'band'] as const satisfies readonly PtResistanceKind[]

export const PT_MEASURE_LABEL: Record<PtMeasure, string> = {
  reps: 'REPS',
  time: 'TIME',
  distance: 'DISTANCE',
}

export const PT_RESISTANCE_LABEL: Record<PtResistanceKind, string> = {
  none: 'NONE',
  weight: 'WEIGHT',
  band: 'BAND',
}

/** Raised for anything the user can fix by editing the form. */
export class PtValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PtValidationError'
  }
}

/**
 * Whether a video link is safe to put in an `href`.
 *
 * PT exercises carry a link the user pastes from their clinic's portal or
 * YouTube, and that string is rendered as an anchor. `javascript:` and `data:`
 * URLs in an href execute on click, so the scheme is allowlisted rather than
 * blocklisted — a relative or scheme-less string is rejected too, because it
 * would resolve against the app's own origin and go nowhere useful.
 */
export function isSafeVideoUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Trim to null, or throw if the user typed something that is not a safe link. */
export function normalizeVideoUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return null
  if (!isSafeVideoUrl(trimmed)) {
    throw new PtValidationError('Video link must be a full http:// or https:// URL')
  }
  return trimmed
}

type TargetFields = Pick<
  PtExercise,
  'measure' | 'targetReps' | 'targetSeconds' | 'targetDistance' | 'distanceUnit'
>

/** One set's target, as text: "15 reps", "0:30", "50 yd". */
export function formatPtTarget(ex: TargetFields): string {
  if (ex.measure === 'reps') return ex.targetReps != null ? `${ex.targetReps} reps` : 'reps'
  if (ex.measure === 'time') return ex.targetSeconds != null ? formatDuration(ex.targetSeconds) : 'time'
  if (ex.targetDistance == null) return 'distance'
  return `${ex.targetDistance} ${ex.distanceUnit ?? 'yd'}`
}

type ResistanceFields = Pick<PtExercise, 'resistanceKind' | 'resistanceWeight' | 'resistanceBand'>

/** The resistance, as text: "180 lb", "red band", or '' for bodyweight work. */
export function formatPtResistance(ex: ResistanceFields): string {
  if (ex.resistanceKind === 'weight') {
    return ex.resistanceWeight != null ? `${ex.resistanceWeight} lb` : ''
  }
  if (ex.resistanceKind === 'band') {
    const band = (ex.resistanceBand ?? '').trim()
    // "red band", but not "red band band" when the user typed the word already.
    return band === '' ? '' : /\bbands?\b/i.test(band) ? band : `${band} band`
  }
  return ''
}

/** The whole prescription on one line: "3 x 50 yd . 180 lb". */
export function formatPtPrescription(ex: TargetFields & ResistanceFields & Pick<PtExercise, 'sets' | 'equipmentHeight' | 'equipmentHeightUnit'>): string {
  const head = `${ex.sets} x ${formatPtTarget(ex)}`
  const resistance = formatPtResistance(ex)
  const height = ex.equipmentHeight == null ? '' : `${ex.equipmentHeight} ${ex.equipmentHeightUnit ?? 'in'} high`
  return [head, resistance, height].filter(Boolean).join(' . ')
}

/** What the routine editor holds per row before anything is written. */
export interface PtExerciseDraft {
  /** Present for a row that already exists in the database. */
  id?: number
  name: string
  description?: string | null
  videoUrl?: string | null
  sets: number
  measure: PtMeasure
  targetReps?: number | null
  targetSeconds?: number | null
  targetDistance?: number | null
  distanceUnit?: PtDistanceUnit | null
  resistanceKind: PtResistanceKind
  resistanceWeight?: number | null
  equipmentHeight?: number | null
  equipmentHeightUnit?: PtExercise['equipmentHeightUnit']
  resistanceBand?: string | null
}

/**
 * Validate one draft row and return exactly the columns that belong to it.
 *
 * Fields outside the chosen measure/resistance are nulled rather than carried:
 * switching an exercise from time to distance otherwise leaves a stale
 * `targetSeconds` in the row, and every reader that checks "is this field set"
 * instead of "is this the measure" would show both.
 */
export function validatePtExercise(draft: PtExerciseDraft, routineId: number, order: number): Omit<PtExercise, 'id'> {
  const name = draft.name.trim()
  if (name === '') throw new PtValidationError('Exercise name is required')

  if (!Number.isInteger(draft.sets) || draft.sets < 1 || draft.sets > 99) {
    throw new PtValidationError(`${name}: sets must be a whole number from 1 to 99`)
  }

  const row: Omit<PtExercise, 'id'> = {
    routineId,
    name,
    description: (draft.description ?? '').trim() || null,
    videoUrl: normalizeVideoUrl(draft.videoUrl),
    sets: draft.sets,
    measure: draft.measure,
    targetReps: null,
    targetSeconds: null,
    targetDistance: null,
    distanceUnit: null,
    resistanceKind: draft.resistanceKind,
    resistanceWeight: null,
    equipmentHeight: null,
    equipmentHeightUnit: null,
    resistanceBand: null,
    order,
  }

  if (draft.measure === 'reps') {
    if (!Number.isInteger(draft.targetReps) || (draft.targetReps as number) < 1) {
      throw new PtValidationError(`${name}: reps must be a whole number of 1 or more`)
    }
    row.targetReps = draft.targetReps
  } else if (draft.measure === 'time') {
    if (draft.targetSeconds == null || !(draft.targetSeconds > 0)) {
      throw new PtValidationError(`${name}: hold time must be more than 0 seconds`)
    }
    row.targetSeconds = draft.targetSeconds
  } else {
    if (draft.targetDistance == null || !(draft.targetDistance > 0)) {
      throw new PtValidationError(`${name}: distance must be more than 0`)
    }
    const unit = draft.distanceUnit ?? 'yd'
    if (!PT_DISTANCE_UNITS.includes(unit)) {
      throw new PtValidationError(`${name}: unknown distance unit "${unit}"`)
    }
    row.targetDistance = draft.targetDistance
    row.distanceUnit = unit
  }

  if (draft.resistanceKind === 'weight') {
    if (draft.resistanceWeight == null || !(draft.resistanceWeight > 0)) {
      throw new PtValidationError(`${name}: resistance weight must be more than 0`)
    }
    row.resistanceWeight = draft.resistanceWeight
  } else if (draft.resistanceKind === 'band') {
    const band = (draft.resistanceBand ?? '').trim()
    if (band === '') throw new PtValidationError(`${name}: name the band (its colour, say)`)
    row.resistanceBand = band
  }

  if (draft.equipmentHeight != null) {
    if (!Number.isFinite(draft.equipmentHeight) || draft.equipmentHeight <= 0) {
      throw new PtValidationError(`${name}: equipment height must be more than 0`)
    }
    const unit = draft.equipmentHeightUnit ?? 'in'
    if (unit !== 'in' && unit !== 'cm') {
      throw new PtValidationError(`${name}: unknown equipment height unit "${unit}"`)
    }
    row.equipmentHeight = draft.equipmentHeight
    row.equipmentHeightUnit = unit
  }

  return row
}

/** Active routines, in display order. */
export async function listPtRoutines(db: TrainingDB): Promise<PtRoutine[]> {
  const rows = await db.ptRoutines.orderBy('order').toArray()
  return rows.filter(r => !r.archived)
}

/** Archived routines, in display order — the restore list. */
export async function listArchivedPtRoutines(db: TrainingDB): Promise<PtRoutine[]> {
  const rows = await db.ptRoutines.orderBy('order').toArray()
  return rows.filter(r => r.archived === true)
}

/**
 * Retire a routine without touching its history.
 *
 * The alternative on offer is `deletePtRoutine`, which takes the runs with it.
 * A rehab block ends but the record of having done it is the part worth
 * keeping, so archiving is the non-destructive half of that pair: the routine
 * leaves the start list, every past run still resolves to its name, and
 * restoring it puts it back unchanged.
 */
export async function archivePtRoutine(db: TrainingDB, routineId: number): Promise<void> {
  await db.ptRoutines.update(routineId, { archived: true })
}

export async function unarchivePtRoutine(db: TrainingDB, routineId: number): Promise<void> {
  await db.ptRoutines.update(routineId, { archived: false })
}

export interface PtRoutineDetail {
  routine: PtRoutine
  /** Active exercises only, in order — what a run of this routine consists of. */
  exercises: PtExercise[]
}

export async function getPtRoutine(db: TrainingDB, routineId: number): Promise<PtRoutineDetail | null> {
  const routine = await db.ptRoutines.get(routineId)
  if (!routine) return null
  const exercises = (await db.ptExercises.where('routineId').equals(routineId).toArray())
    .filter(e => !e.archived)
    .sort((a, b) => a.order - b.order)
  return { routine, exercises }
}

export interface PtRoutineInput {
  /** Absent for a new routine. */
  id?: number
  name: string
  notes?: string | null
  exercises: PtExerciseDraft[]
}

/**
 * Write a whole routine — name, notes and the full exercise list — in one
 * transaction, and return its id.
 *
 * The editor holds a draft and calls this once on DONE. Nothing is written
 * while the user is still editing, so CANCEL genuinely leaves the database
 * untouched and closing the screen mid-edit cannot leave a half-built routine
 * (or, for a new routine, a nameless empty one) behind.
 *
 * Every row is validated BEFORE the transaction opens. A validation error is
 * the common case here — it is a typo in a form — and discovering it halfway
 * through the writes would mean rolling back work the user cannot see.
 */
export async function savePtRoutine(db: TrainingDB, input: PtRoutineInput): Promise<number> {
  const name = input.name.trim()
  if (name === '') throw new PtValidationError('Routine name is required')
  if (input.exercises.length === 0) {
    throw new PtValidationError('Add at least one exercise before saving')
  }

  const notes = (input.notes ?? '').trim() || null
  const routineId = input.id
  const rows = input.exercises.map((draft, i) => ({
    draft,
    row: validatePtExercise(draft, routineId ?? 0, i),
  }))

  // Which of the removed exercises have been performed. Read before the
  // transaction: it decides delete-vs-archive below, and `transaction` is a
  // serial queue — a query issued from inside one is fine, but the decision is
  // pure input to the write, so it belongs outside where it cannot lengthen the
  // lock. See lib/session.ts for the same split.
  let id = routineId
  let toDelete: number[] = []
  let toArchive: number[] = []
  if (id != null) {
    const existing = await db.ptExercises.where('routineId').equals(id).toArray()
    const kept = new Set(rows.map(r => r.draft.id).filter((v): v is number => v != null))
    const removed = existing.filter(e => !e.archived && e.id != null && !kept.has(e.id))
    if (removed.length > 0) {
      const checks = await db.ptSetChecks
        .where('ptExerciseId').anyOf(removed.map(e => e.id!))
        .toArray()
      const performed = new Set(checks.map(c => c.ptExerciseId))
      toArchive = removed.filter(e => performed.has(e.id!)).map(e => e.id!)
      toDelete = removed.filter(e => !performed.has(e.id!)).map(e => e.id!)
    }
  }

  await db.transaction(async () => {
    if (id == null) {
      const siblings = await db.ptRoutines.toArray()
      const order = siblings.reduce((max, r) => Math.max(max, r.order), -1) + 1
      id = await db.ptRoutines.add({ name, notes, order })
    } else {
      await db.ptRoutines.update(id, { name, notes })
    }

    for (const { draft, row } of rows) {
      const next = { ...row, routineId: id }
      if (draft.id == null) await db.ptExercises.add(next)
      else await db.ptExercises.update(draft.id, next)
    }

    for (const exerciseId of toDelete) await db.ptExercises.delete(exerciseId)
    // Kept, not deleted: these rows are named by `ptSetChecks` rows in runs the
    // user already did. Removing them would leave those runs pointing at an id
    // that no longer resolves to a name.
    for (const exerciseId of toArchive) await db.ptExercises.update(exerciseId, { archived: true })
  })

  return id!
}

/**
 * Delete a routine, its exercises, and every run of it.
 *
 * Genuinely destructive — a routine's history has no meaning without the
 * prescription it was run against, so the two go together rather than leaving
 * dated runs of a routine that no longer exists. Callers confirm first.
 */
export async function deletePtRoutine(db: TrainingDB, routineId: number): Promise<void> {
  const sessions = await db.ptSessions.where('routineId').equals(routineId).toArray()
  const sessionIds = sessions.map(s => s.id!).filter(id => id != null)
  await db.transaction(async () => {
    if (sessionIds.length > 0) {
      await db.ptSetChecks.where('sessionId').anyOf(sessionIds).delete()
      await db.ptNotes.where('sessionId').anyOf(sessionIds).delete()
      await db.ptSessions.where('routineId').equals(routineId).delete()
    }
    await db.ptExercises.where('routineId').equals(routineId).delete()
    await db.ptRoutines.delete(routineId)
  })
}

export interface PtRunCheck {
  ptExerciseId: number
  setNumber: number
  done: boolean
}

export interface PtRunInput {
  routineId: number
  date: Date
  notes?: string | null
  checks: PtRunCheck[]
  /** Per-exercise note, keyed by ptExercise id. Blank entries are dropped. */
  exerciseNotes?: Record<number, string>
}

/**
 * Write one finished run: the session row, a check row per prescribed set, and
 * any per-exercise notes — all in one transaction.
 *
 * This is the only place a PT run touches the database. Ticking a box during a
 * run writes to `store/pt-store` and nothing else, so abandoning a run leaves
 * no row to reconcile and no orphan to clean up.
 */
export async function commitPtRun(db: TrainingDB, run: PtRunInput): Promise<number> {
  return (await commitPtSession(db, [run]))[0]
}

/** Save all selected routines atomically so retrying cannot duplicate a partial session. */
export async function commitPtSession(db: TrainingDB, runs: PtRunInput[]): Promise<number[]> {
  const ids: number[] = []
  await db.transaction(async () => {
    for (const run of runs) ids.push(await writePtRun(db, run))
  })
  return ids
}

async function writePtRun(db: TrainingDB, run: PtRunInput): Promise<number> {
  if (run.checks.length === 0) {
    throw new PtValidationError('Nothing to save — this routine has no sets')
  }

  const notes = (run.notes ?? '').trim() || null
  const exerciseNotes = Object.entries(run.exerciseNotes ?? {})
    .map(([exerciseId, text]) => ({ ptExerciseId: Number(exerciseId), notes: text.trim() }))
    .filter(n => n.notes !== '')

  const sessionId = await db.ptSessions.add({ routineId: run.routineId, date: run.date, notes })
  await db.ptSetChecks.bulkAdd(run.checks.map(c => ({
    sessionId,
    ptExerciseId: c.ptExerciseId,
    setNumber: c.setNumber,
    done: c.done,
  })))
  if (exerciseNotes.length > 0) {
    await db.ptNotes.bulkAdd(exerciseNotes.map(n => ({ ...n, sessionId })))
  }
  return sessionId
}

export interface PtSessionSummary {
  session: PtSession
  routineName: string
  done: number
  total: number
}

/** Completed runs, newest first. */
export async function listPtSessions(db: TrainingDB, limit?: number): Promise<PtSessionSummary[]> {
  const sessions = (await db.ptSessions.toArray())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
  const capped = limit != null ? sessions.slice(0, limit) : sessions
  if (capped.length === 0) return []

  // Two queries for the whole list, not two per row: a rehab block is a run a
  // day for months, and the history list is the screen's first paint.
  const ids = capped.map(s => s.id!).filter(id => id != null)
  const [checks, routines] = await Promise.all([
    db.ptSetChecks.where('sessionId').anyOf(ids).toArray(),
    db.ptRoutines.toArray(),
  ])
  const nameById = new Map(routines.map(r => [r.id!, r.name]))
  const bySession = new Map<number, PtSetCheck[]>()
  for (const check of checks) {
    const bucket = bySession.get(check.sessionId)
    if (bucket) bucket.push(check)
    else bySession.set(check.sessionId, [check])
  }

  return capped.map(session => {
    const rows = bySession.get(session.id!) ?? []
    return {
      session,
      routineName: nameById.get(session.routineId) ?? 'Deleted routine',
      done: rows.filter(r => r.done).length,
      total: rows.length,
    }
  })
}

export interface PtSessionExercise {
  exercise: PtExercise
  checks: PtSetCheck[]
  note: string | null
}

export interface PtSessionDetail {
  session: PtSession
  routineName: string
  exercises: PtSessionExercise[]
}

export async function getPtSessionDetail(db: TrainingDB, sessionId: number): Promise<PtSessionDetail | null> {
  const session = await db.ptSessions.get(sessionId)
  if (!session) return null

  const [checks, notes, routine] = await Promise.all([
    db.ptSetChecks.where('sessionId').equals(sessionId).toArray(),
    db.ptNotes.where('sessionId').equals(sessionId).toArray(),
    db.ptRoutines.get(session.routineId),
  ])

  // The run's own exercise ids, not the routine's current list — an exercise
  // dropped from the routine since (and so archived) still has to render under
  // the run that performed it.
  const exerciseIds = [...new Set(checks.map(c => c.ptExerciseId))]
  const exercises = exerciseIds.length > 0
    ? await db.ptExercises.where('id').anyOf(exerciseIds).toArray()
    : []
  const noteByExercise = new Map<number, string>(notes.map((n: PtNote) => [n.ptExerciseId, n.notes]))

  const rows: PtSessionExercise[] = exercises
    .sort((a, b) => a.order - b.order)
    .map(exercise => ({
      exercise,
      checks: checks
        .filter(c => c.ptExerciseId === exercise.id)
        .sort((a, b) => a.setNumber - b.setNumber),
      note: noteByExercise.get(exercise.id!) ?? null,
    }))

  return { session, routineName: routine?.name ?? 'Deleted routine', exercises: rows }
}

export async function deletePtSession(db: TrainingDB, sessionId: number): Promise<void> {
  await db.transaction(async () => {
    await db.ptSetChecks.where('sessionId').equals(sessionId).delete()
    await db.ptNotes.where('sessionId').equals(sessionId).delete()
    await db.ptSessions.delete(sessionId)
  })
}

/**
 * Rows that reference something that is no longer there.
 *
 * Nothing in the app creates these: `savePtRoutine` only hard-deletes an
 * exercise with no checks against it, and `deletePtRoutine` takes the runs,
 * checks and notes with it in one transaction. An IMPORT can, though — a
 * backup carries whatever tables it carries, and one taken mid-edit or trimmed
 * by hand can restore checks whose session is absent. Left alone they are
 * invisible: `getPtSessionDetail` reads the run's own exercise ids and simply
 * drops the ones that do not resolve, so a run silently renders as 2/2 when
 * three sets were recorded.
 *
 * Pure, and separate from `buildCleanupPlan`: the two share no rows, and one
 * function taking nine positional arrays across both domains is how the
 * argument order gets confused.
 */
export interface PtCleanupPlan {
  /** Exercises belonging to a routine that no longer exists. */
  orphanExerciseIds: number[]
  /** Runs of a routine that no longer exists. */
  orphanSessionIds: number[]
  /** Checks whose run, or whose exercise, is gone. */
  orphanCheckIds: number[]
  /** Notes whose run, or whose exercise, is gone. */
  orphanNoteIds: number[]
}

export function buildPtCleanupPlan(
  routines: Array<{ id: number }>,
  exercises: Array<{ id: number; routineId: number }>,
  sessions: Array<{ id: number; routineId: number }>,
  checks: Array<{ id: number; sessionId: number; ptExerciseId: number }>,
  notes: Array<{ id: number; sessionId: number; ptExerciseId: number }>,
): PtCleanupPlan {
  const routineIds = new Set(routines.map(r => r.id))
  const orphanExerciseIds = exercises.filter(e => !routineIds.has(e.routineId)).map(e => e.id)
  const orphanSessionIds = sessions.filter(s => !routineIds.has(s.routineId)).map(s => s.id)

  // A check is kept only if BOTH ends resolve, and the sessions being removed
  // above count as already gone — otherwise cleaning up a run would leave its
  // checks behind as a second generation of orphans on the next pass.
  const doomedSessions = new Set(orphanSessionIds)
  const liveSessionIds = new Set(
    sessions.filter(s => !doomedSessions.has(s.id)).map(s => s.id),
  )
  const doomedExercises = new Set(orphanExerciseIds)
  const liveExerciseIds = new Set(
    exercises.filter(e => !doomedExercises.has(e.id)).map(e => e.id),
  )
  const dangling = (row: { sessionId: number; ptExerciseId: number }) =>
    !liveSessionIds.has(row.sessionId) || !liveExerciseIds.has(row.ptExerciseId)

  return {
    orphanExerciseIds,
    orphanSessionIds,
    orphanCheckIds: checks.filter(dangling).map(c => c.id),
    orphanNoteIds: notes.filter(dangling).map(n => n.id),
  }
}

/** How many rows a plan would remove. Zero means there was nothing to do. */
export function ptCleanupCount(plan: PtCleanupPlan): number {
  return plan.orphanExerciseIds.length + plan.orphanSessionIds.length
    + plan.orphanCheckIds.length + plan.orphanNoteIds.length
}

/** Read the four tables, work out the plan, and return it unapplied. */
export async function planPtCleanup(db: TrainingDB): Promise<PtCleanupPlan> {
  const [routines, exercises, sessions, checks, notes] = await Promise.all([
    db.ptRoutines.toArray(),
    db.ptExercises.toArray(),
    db.ptSessions.toArray(),
    db.ptSetChecks.toArray(),
    db.ptNotes.toArray(),
  ])
  return buildPtCleanupPlan(
    routines.map(r => ({ id: r.id! })),
    exercises.map(e => ({ id: e.id!, routineId: e.routineId })),
    sessions.map(s => ({ id: s.id!, routineId: s.routineId })),
    checks.map(c => ({ id: c.id!, sessionId: c.sessionId, ptExerciseId: c.ptExerciseId })),
    notes.map(n => ({ id: n.id!, sessionId: n.sessionId, ptExerciseId: n.ptExerciseId })),
  )
}

/**
 * Apply a plan in one transaction.
 *
 * Takes the plan rather than recomputing it, so the caller can show the user
 * what is about to go and delete exactly that.
 */
export async function applyPtCleanup(db: TrainingDB, plan: PtCleanupPlan): Promise<void> {
  if (ptCleanupCount(plan) === 0) return
  await db.transaction(async () => {
    if (plan.orphanCheckIds.length > 0) await db.ptSetChecks.where('id').anyOf(plan.orphanCheckIds).delete()
    if (plan.orphanNoteIds.length > 0) await db.ptNotes.where('id').anyOf(plan.orphanNoteIds).delete()
    if (plan.orphanSessionIds.length > 0) await db.ptSessions.where('id').anyOf(plan.orphanSessionIds).delete()
    if (plan.orphanExerciseIds.length > 0) await db.ptExercises.where('id').anyOf(plan.orphanExerciseIds).delete()
  })
}

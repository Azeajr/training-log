import { createSignal } from 'solid-js'
import type { TrainingDB } from '../db/index'
import type { TrainingMax, TmSource } from '../types/domain'

// "Does this install have any training maxes at all?" — the one fact the
// onboarding redirect in AppShell needs. It used to re-derive this with a
// `db.trainingMaxes.count()` on every single navigation; the query is cheap, but
// the answer only changes at the few places below, so it's tracked instead of
// re-asked. `null` means not yet determined: the redirect holds off rather than
// bouncing a user to /setup on the strength of an unanswered question.
//
// It lives here rather than in `store/` because `lib/` has no other dependency
// on the reactive stores, and this is the module that already owns TM writes.
const [hasTrainingMaxes, setHasTrainingMaxes] = createSignal<boolean | null>(null)

export { hasTrainingMaxes }

// Any insert can only take the table from empty to non-empty, so it needs no
// query to know the answer.
export function noteTrainingMaxAdded(): void {
  setHasTrainingMaxes(true)
}

// For the paths that can subtract — today only a destructive import, which
// clears every table before restoring whatever the payload holds.
export async function refreshTrainingMaxPresence(db: TrainingDB): Promise<boolean> {
  const present = (await db.trainingMaxes.count()) > 0
  setHasTrainingMaxes(present)
  return present
}

/** Test helper — returns the signal to its "not yet determined" state. */
export function resetTrainingMaxPresence(): void {
  setHasTrainingMaxes(null)
}

// `trainingMaxes` is append-only with no ordering key but `setAt`, and the
// concurrent post-session paths write rows at the same instant. The tie-break is
// the row id: it is INTEGER PRIMARY KEY AUTOINCREMENT, so it is monotonic and
// never reused, which makes the highest id at a given instant the newest insert.
// This is the one definition — `getAllCurrentTms` used to disagree with it,
// resolving the same tie to the opposite row (F36).
const isNewer = (a: TrainingMax, b: TrainingMax): boolean => {
  const at = new Date(a.setAt).getTime()
  const bt = new Date(b.setAt).getTime()
  return at !== bt ? at > bt : (a.id ?? 0) > (b.id ?? 0)
}

export async function getCurrentTm(db: TrainingDB, liftId: number): Promise<number> {
  const tms = await db.trainingMaxes.where('liftId').equals(liftId).toArray()
  let best: TrainingMax | undefined
  for (const tm of tms) if (!best || isNewer(tm, best)) best = tm
  return best?.weight ?? 0
}

/**
 * Write a training max.
 *
 * `source` defaults to `'manual'` because every call site here is a person
 * choosing a number — the Settings field, the post-session TM prompt, and
 * accepting a doubled increment. Auto-progression and deloads go through
 * `cycle.ts` and say so explicitly. Recording it is what lets the doubling
 * check stop guessing from a wall clock (F39).
 */
export async function setTm(
  db: TrainingDB,
  liftId: number,
  weight: number,
  source: TmSource = 'manual',
  cycleId?: number,
): Promise<number> {
  const id = await db.trainingMaxes.add({ liftId, weight, setAt: new Date(), source, cycleId: cycleId ?? null })
  noteTrainingMaxAdded()
  return id
}

// Latest accessory training max per exercise, for a set of exercise ids. One
// definition shared by the accessory picker and the assistance-default resolver
// — both need "the current TM for these accessories" from an append-only table.
export async function getLatestAccessoryTms(
  db: TrainingDB,
  exerciseIds: number[],
): Promise<Map<number, number>> {
  const latest = new Map<number, number>()
  if (exerciseIds.length === 0) return latest
  const atms = await db.accessoryTrainingMaxes.where('exerciseId').anyOf(exerciseIds).sortBy('setAt')
  for (const atm of atms) latest.set(atm.exerciseId, atm.weight)
  return latest
}

export async function getAllCurrentTms(
  db: TrainingDB
): Promise<Record<number, number>> {
  const tms = await db.trainingMaxes.toArray()
  const best = new Map<number, TrainingMax>()
  for (const tm of tms) {
    const held = best.get(tm.liftId)
    // Same rule as getCurrentTm. This used to compare with a strict `>` on the
    // timestamp alone over table order, so at an equal instant the FIRST row
    // won here and the LAST row won there (F36).
    if (!held || isNewer(tm, held)) best.set(tm.liftId, tm)
  }
  const result: Record<number, number> = {}
  for (const [liftId, tm] of best) result[liftId] = tm.weight
  return result
}

import { createSignal } from 'solid-js'
import type { TrainingDB } from '../db/index'

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

export async function getCurrentTm(db: TrainingDB, liftId: number): Promise<number> {
  const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
  return tms[tms.length - 1]?.weight ?? 0
}

export async function setTm(db: TrainingDB, liftId: number, weight: number): Promise<number> {
  const id = await db.trainingMaxes.add({ liftId, weight, setAt: new Date() })
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
  const result: Record<number, number> = {}
  const latestAt: Record<number, number> = {}
  for (const tm of tms) {
    const ts = new Date(tm.setAt).getTime()
    if (latestAt[tm.liftId] === undefined || ts > latestAt[tm.liftId]) {
      latestAt[tm.liftId] = ts
      result[tm.liftId] = tm.weight
    }
  }
  return result
}

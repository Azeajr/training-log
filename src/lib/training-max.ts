import type { TrainingDB } from '../db/index'

export async function getCurrentTm(db: TrainingDB, liftId: number): Promise<number> {
  const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
  return tms[tms.length - 1]?.weight ?? 0
}

export async function setTm(db: TrainingDB, liftId: number, weight: number): Promise<number> {
  return db.trainingMaxes.add({ liftId, weight, setAt: new Date() })
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

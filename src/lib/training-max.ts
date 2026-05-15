import type { TrainingDB } from './types'

export async function getCurrentTm(db: TrainingDB, liftId: number): Promise<number> {
  const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
  return tms[tms.length - 1]?.weight ?? 0
}

export async function setTm(db: TrainingDB, liftId: number, weight: number): Promise<number> {
  return db.trainingMaxes.add({ liftId, weight, setAt: new Date() })
}

export async function getAllCurrentTms(
  db: TrainingDB
): Promise<Record<number, number>> {
  const lifts = await db.lifts.toArray()
  const result: Record<number, number> = {}
  for (const lift of lifts) {
    const tms = await db.trainingMaxes.where('liftId').equals(lift.id!).sortBy('setAt')
    const latest = tms[tms.length - 1]
    if (latest) result[lift.id!] = latest.weight
  }
  return result
}

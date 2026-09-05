import type { TrainingDB } from '../db/index'
import {
  ACCESSORY_PERCENTAGE,
  ACCESSORY_SETS,
  DEFAULT_ACCESSORY_INCREMENT_LB,
  roundToNearest5,
} from './calc'

export interface AccessoryTmRecommendation {
  exerciseId: number
  exerciseName: string
  currentTm: number
  suggestedTm: number
  /** The weight actually worked, every set. */
  workedWeight: number
}

// Changing the weight on an accessory used to rewrite its training max on the
// spot, from the same LOG button used twenty times a session: a per-set decision
// ("the 45s were taken, I took 50s") silently became a permanent program change.
//
// The main lifts already model this correctly — a big AMRAP only *offers* a new
// training max, after the session, through a dialog. Accessories now follow the
// same rule, with one extra guard: a single heavier set proves nothing, so the
// exercise has to have been worked at the same off-prescription weight for its
// whole slate before it counts as an intent.
export function getAccessoryTmRecommendations(
  accessories: ReadonlyArray<{
    exerciseId: number
    exerciseName: string
    tm: number
    calculatedWeight: number
    loggedSets: ReadonlyArray<{ weight?: number | null }>
  }>,
): AccessoryTmRecommendation[] {
  const out: AccessoryTmRecommendation[] = []
  for (const acc of accessories) {
    const weights = acc.loggedSets
      .map(s => s.weight)
      .filter((w): w is number => w != null && w > 0)
    if (weights.length < ACCESSORY_SETS) continue

    const worked = weights[0]
    if (!weights.every(w => w === worked)) continue
    if (worked === acc.calculatedWeight) continue

    const suggestedTm = roundToNearest5(worked / ACCESSORY_PERCENTAGE)
    if (suggestedTm === acc.tm) continue

    out.push({
      exerciseId: acc.exerciseId,
      exerciseName: acc.exerciseName,
      currentTm: acc.tm,
      suggestedTm,
      workedWeight: worked,
    })
  }
  return out
}

// Append a new training max for an accessory, inheriting the increment from its
// latest row so a per-exercise progression rate survives the change.
export async function applyAccessoryTm(
  db: TrainingDB,
  exerciseId: number,
  weight: number,
): Promise<void> {
  const tms = await db.accessoryTrainingMaxes
    .where('exerciseId').equals(exerciseId)
    .sortBy('setAt')
  const current = tms[tms.length - 1]
  await db.accessoryTrainingMaxes.add({
    exerciseId,
    weight,
    incrementLb: current?.incrementLb ?? DEFAULT_ACCESSORY_INCREMENT_LB,
    setAt: new Date(),
  })
}

import type { HighRepDiscount, Set } from '../types/domain'
import { estimated1RM } from './calc'

// A completed lift performance: anything that represents real loaded work.
// Callers decide ownership/attribution (a cross set belongs to its movement
// lift); this rule excludes warmups, failures, and unloaded rows. The weight
// guard matters because the weight stepper bottoms out at 0: a 0lb set scores
// an e1RM of 0, which would otherwise drag a median seed down (or, as a week's
// only set, zero it out) and read as a real record.
export const isWorkingPerformance = (set: Set): boolean =>
  set.type !== 'warmup' && set.reps >= 1 && set.weight > 0

export const bestEstimatedPerformance = (
  sets: readonly Set[],
  discount: HighRepDiscount = 'off',
): Set | undefined => sets.reduce<Set | undefined>((best, set) =>
  !best || estimated1RM(set.weight, set.reps, discount) > estimated1RM(best.weight, best.reps, discount)
    ? set
    : best,
undefined)

import type { HighRepDiscount, Set } from '../types/domain'
import { estimated1RM } from './calc'

// A completed lift performance: anything that represents real loaded work.
// Callers decide ownership/attribution (a cross set belongs to its movement
// lift); this rule deliberately only excludes warmups and failures.
export const isWorkingPerformance = (set: Set): boolean =>
  set.type !== 'warmup' && set.reps >= 1

export const bestEstimatedPerformance = (
  sets: readonly Set[],
  discount: HighRepDiscount = 'off',
): Set | undefined => sets.reduce<Set | undefined>((best, set) =>
  !best || estimated1RM(set.weight, set.reps, discount) > estimated1RM(best.weight, best.reps, discount)
    ? set
    : best,
undefined)

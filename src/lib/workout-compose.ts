import {
  calcMainSets, calcWarmup, calcAmrapTarget, calcSupplementalSets,
  targetReps, est1RMFromTm, applyMainCascadeToSupplemental, applySupplementalOverride,
  supplementalSourceSetNumber, effectiveSupplementalWeek,
} from './calc'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet, CrossSet } from './calc'
import type { Set, SupplementalTemplate, DeloadSupplemental, HighRepDiscount } from '../types/domain'

// The Workout screen's set derivation, lifted out of the component that renders
// it. These were always pure — plain inputs in, plain data out, no signal reads —
// they just happened to be declared as closures inside `Workout()`, which meant
// the only way to test them was to render the whole 873-line screen. Here they
// take their inputs explicitly and can be exercised directly.

/** The subset of a loaded cross-lift block that composition actually needs. */
export interface CrossBlockPlan {
  movementLiftId: number
  computed: CrossSet[]
}

export type ComposedSet = WarmupSet | MainSet | FslSet | JokerSet

export interface ComposeInput {
  tm: number
  week: 1 | 2 | 3 | 4
  template: SupplementalTemplate
  barWeight: number
  deloadSupplemental: DeloadSupplemental
  /** The linear logged sets for this session's own lift. */
  loggedSets: Set[]
  crossBlocks: CrossBlockPlan[]
  /** Logged cross sets across all blocks, tagged by movement liftId. */
  loggedCrossSets: Set[]
}

// Cross blocks are independent of the linear list — each computed from its
// movement lift's TM and restored from its own logged store. Like the
// supplemental tail, a logged set's weight overrides the remaining planned sets
// of the same block (matched by movement liftId), and extra logged sets beyond
// the plan are restored.
export function composeCrossSets(
  blocks: CrossBlockPlan[],
  loggedCrossSets: Set[],
): CrossSet[] {
  return blocks.flatMap(block => {
    const logged = loggedCrossSets.filter(s => s.liftId === block.movementLiftId)
    let sets: CrossSet[] = block.computed
    if (logged.length > 0) {
      const override = logged[logged.length - 1].weight
      sets = sets.map((s, i) => i >= logged.length ? { ...s, weight: override } : s)
    }
    const extra: CrossSet[] = logged.slice(sets.length).map((s, i) => ({
      setNumber: sets.length + i + 1, weight: s.weight, reps: s.reps, type: 'cross' as const, liftId: block.movementLiftId,
    }))
    return [...sets, ...extra]
  })
}

// The single derivation of the rendered set list. Planned sets come from the TM;
// everything the user actually did — an overridden source-set weight, a
// supplemental override, jokers, extra added sets — is restored from loggedSets,
// so the result is identical after a rebuild or a mid-session reload.
export function composeAllSets(input: ComposeInput): {
  all: ComposedSet[]
  cross: CrossSet[]
  main: MainSet[]
} {
  const { tm, week, template, barWeight, deloadSupplemental, loggedSets } = input
  const main = calcMainSets(tm, week, barWeight)
  const warmup = calcWarmup(tm, main[0].weight, barWeight)

  // Supplemental runs at the effective week (deload may remap or skip it).
  const eff = effectiveSupplementalWeek(week, deloadSupplemental)
  const suppMain = eff === null ? [] : calcMainSets(tm, eff, barWeight)
  let fsl = eff === null ? [] : calcSupplementalSets(template, suppMain, tm, eff, barWeight)
  const sourceSetNumber = supplementalSourceSetNumber(template)
  const loggedSource = sourceSetNumber === null
    ? undefined
    : loggedSets.find(s => s.type === 'main' && s.setNumber === sourceSetNumber)
  // Cascade the logged top set into supplemental only when supplemental tracks
  // this week's main sets. On a remapped deload (eff !== week) the supplemental
  // weight is decoupled from the lighter deload top set, so skip the cascade.
  if (loggedSource && eff === week) fsl = applyMainCascadeToSupplemental(fsl, template, loggedSource.weight)
  fsl = applySupplementalOverride(fsl, loggedSets, template)
  const extraFsl: FslSet[] = template === 'none' ? [] : loggedSets
    .filter(s => s.type === template)
    .slice(fsl.length)
    .map((s, i) => ({ setNumber: fsl.length + i + 1, weight: s.weight, reps: s.reps, type: template }))

  const restoredJokers: JokerSet[] = loggedSets
    .filter(s => s.type === 'joker')
    .map((s, i) => ({ type: 'joker' as const, setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false as const }))

  return {
    all: [...warmup, ...main, ...restoredJokers, ...fsl, ...extraFsl],
    cross: composeCrossSets(input.crossBlocks, input.loggedCrossSets),
    main,
  }
}

// Targets for today's AMRAP at a given weight: beat the robust recent working
// performance seed when history exists, otherwise the e1RM implied by the TM.
export function amrapTargetsFor(
  weight: number,
  recentPerformances: Array<{ weight: number; reps: number }>,
  tm: number,
  discount: HighRepDiscount = 'off',
): AmrapTarget[] {
  const target = calcAmrapTarget(recentPerformances, weight, discount)
  if (target) return [target]
  if (tm <= 0) return []
  const est1RM = est1RMFromTm(tm)
  const reps = targetReps(est1RM, weight, discount)
  if (reps === null) return []
  return [{ label: 'goal', reps, est1RM: Math.round(est1RM) }]
}

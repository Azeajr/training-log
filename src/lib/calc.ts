import type { PlateConfig, SupplementalTemplate, SupplementalSetType, DeloadSupplemental } from '../types/domain'

export const MAIN_PERCENTAGES = {
  1: [0.65, 0.75, 0.85],
  2: [0.70, 0.80, 0.90],
  3: [0.75, 0.85, 0.95],
  4: [0.40, 0.50, 0.60],
} as const

export const MAIN_REPS = {
  1: [5, 5, 5],
  2: [3, 3, 3],
  3: [5, 3, 1],
  4: [5, 5, 5],
} as const

export const FSL_SETS = 5
export const FSL_REPS = 5

export const BBB_PCT = 0.50
export const BBS_PERCENTAGES = { 1: 0.60, 2: 0.70, 3: 0.80, 4: null } as const

export const ACCESSORY_PERCENTAGE = 0.75
export const ACCESSORY_SETS = 3
export const ACCESSORY_REPS = 10

export const BAR_WEIGHT = 45

export const TM_PCT_OF_1RM = 0.9
export const est1RMFromTm = (tm: number): number => tm / TM_PCT_OF_1RM

export const DEFAULT_ACCESSORY_INCREMENT_LB = 5

export const SET_TYPE_DISPLAY_ORDER = ['warmup', 'main', 'joker', 'fsl', 'ssl', 'bbb', 'fsl+bbb', 'ssl+bbb', 'bbs'] as const
export const SET_TYPE_EDIT_ORDER = ['warmup', 'main', 'fsl', 'ssl', 'bbb', 'fsl+bbb', 'ssl+bbb', 'bbs', 'joker'] as const

export const isSupplementalType = (t: string): boolean =>
  t === 'fsl' || t === 'ssl' || t === 'bbb' || t === 'fsl+bbb' || t === 'ssl+bbb' || t === 'bbs'

// Which main set a supplemental template derives its weight from:
// FSL variants follow main set 1, SSL variants follow main set 2.
// BBB/BBS are TM-percentage based and have no main-set source.
export const supplementalSourceSetNumber = (template: SupplementalTemplate): 1 | 2 | null => {
  switch (template) {
    case 'fsl':
    case 'fsl+bbb': return 1
    case 'ssl':
    case 'ssl+bbb': return 2
    default: return null
  }
}

export function applyMainCascadeToSupplemental<T extends { type: string; weight: number }>(
  sets: T[],
  template: SupplementalTemplate,
  sourceSetWeight: number,
): T[] {
  if (supplementalSourceSetNumber(template) === null) return sets
  return sets.map(s => s.type === template ? { ...s, weight: sourceSetWeight } : s)
}

export function applySupplementalOverride<T extends { type: string; weight: number }>(
  computed: T[],
  loggedSets: ReadonlyArray<{ type: string; weight: number }>,
  template: SupplementalTemplate,
): T[] {
  if (template === 'none') return computed
  const logged = loggedSets.filter(s => s.type === template)
  if (logged.length === 0) return computed
  const override = logged[logged.length - 1].weight
  return computed.map((s, i) => i >= logged.length ? { ...s, weight: override } : s)
}

export type RestPhase = 'idle' | 'nudge' | 'warning' | 'critical'
export interface RestStatus { phase: RestPhase; message: string }

export const REST_NORMAL_THRESHOLD = 90
export const REST_TRANSITION_THRESHOLD = 60
export const REST_FAIL_NUDGE = 180
export const REST_FAIL_MAX = 300

export function restStatus(elapsed: number, type: 'normal' | 'transition' | 'fail'): RestStatus {
  if (type === 'fail') {
    if (elapsed >= REST_FAIL_MAX) return { phase: 'critical', message: 'REST UP — SET FAILED' }
    if (elapsed >= REST_FAIL_NUDGE) return { phase: 'warning', message: 'TIME FOR YOUR NEXT SET' }
    return { phase: 'idle', message: '' }
  }
  if (type === 'transition') {
    if (elapsed >= REST_TRANSITION_THRESHOLD) return { phase: 'nudge', message: 'TIME FOR YOUR NEXT SET' }
    return { phase: 'idle', message: '' }
  }
  if (elapsed >= REST_NORMAL_THRESHOLD) return { phase: 'nudge', message: 'TIME FOR YOUR NEXT SET' }
  return { phase: 'idle', message: '' }
}

export const roundToNearest5 = (weight: number): number =>
  Math.round(weight / 5) * 5

export interface MainSet {
  setNumber: number
  weight: number
  reps: number
  isAmrap: boolean
  type: 'main'
}

export const calcMainSets = (tm: number, week: 1 | 2 | 3 | 4, barWeight = BAR_WEIGHT): MainSet[] => {
  const percentages = MAIN_PERCENTAGES[week]
  const reps = MAIN_REPS[week]
  return percentages.map((pct, i) => ({
    setNumber: i + 1,
    weight: Math.max(barWeight, roundToNearest5(tm * pct)),
    reps: reps[i],
    isAmrap: week !== 4 && i === 2,
    type: 'main',
  }))
}

export interface JokerSet {
  type: 'joker'
  setNumber: number
  weight: number
  reps: number
  isAmrap: false
}

export const JOKER_MIN_REPS: Record<number, number> = { 1: 5, 2: 3, 3: 1 }

export const calcJokerIncrement = (amrapReps: number, weekGoalReps: number): number =>
  amrapReps > 2 * weekGoalReps ? 0.10 : 0.05

export const calcNextJokerWeight = (prevWeight: number, increment: number): number =>
  roundToNearest5(prevWeight * (1 + increment))

export const calcJokerSet = (prevWeight: number, setNumber: number, reps: number, increment: number): JokerSet => ({
  type: 'joker',
  setNumber,
  weight: calcNextJokerWeight(prevWeight, increment),
  reps,
  isAmrap: false,
})

// Jokers chain off what was actually lifted, not the plan: the last logged
// joker if any, otherwise the logged AMRAP (the last logged main set). Falls
// back to the planned AMRAP weight when no main/joker set is logged yet.
export const jokerChainBaseWeight = (
  loggedSets: ReadonlyArray<{ type: string; weight: number }>,
  plannedAmrapWeight: number,
): number => {
  for (let i = loggedSets.length - 1; i >= 0; i--) {
    const { type, weight } = loggedSets[i]
    if (type === 'joker' || type === 'main') return weight
  }
  return plannedAmrapWeight
}

export const shouldShowJokerButton = (params: {
  week: 1 | 2 | 3 | 4
  loggedSets: ReadonlyArray<{ reps: number; type: string }>
  warmupCount: number
  mainCount: number
  jokerCount: number
}): boolean => {
  const { week, loggedSets, warmupCount, mainCount, jokerCount } = params
  if (week === 4) return false
  // Once FSL has started, inserting a joker would shift indices and corrupt the logged set mapping.
  if (loggedSets.length > warmupCount + mainCount + jokerCount) return false
  // Check the last relevant set: AMRAP when no jokers, last joker otherwise.
  // If that set hasn't been logged yet (joker is pending), hide the button.
  const lastRelevantIdx = warmupCount + mainCount + jokerCount - 1
  const lastRelevantSet = loggedSets[lastRelevantIdx]
  return lastRelevantSet != null && lastRelevantSet.reps >= (JOKER_MIN_REPS[week] ?? 1)
}

export interface FslSet {
  setNumber: number
  weight: number
  reps: number
  type: SupplementalSetType
}

const buildFixedSets = (weight: number, reps: number, type: SupplementalSetType, count = FSL_SETS): FslSet[] =>
  Array.from({ length: count }, (_, i) => ({ setNumber: i + 1, weight, reps, type }))

export const calcFslSets    = (firstSetWeight: number)  => buildFixedSets(firstSetWeight,  FSL_REPS, 'fsl')
export const calcSslSets    = (secondSetWeight: number) => buildFixedSets(secondSetWeight, FSL_REPS, 'ssl')
export const calcFslBbbSets = (firstSetWeight: number)  => buildFixedSets(firstSetWeight,  10,       'fsl+bbb')
export const calcSslBbbSets = (secondSetWeight: number) => buildFixedSets(secondSetWeight, 10,       'ssl+bbb')

export const calcBbbSets = (tm: number, barWeight = BAR_WEIGHT): FslSet[] =>
  buildFixedSets(Math.max(barWeight, roundToNearest5(tm * BBB_PCT)), 10, 'bbb')

export const calcBbsSets = (tm: number, week: 1 | 2 | 3 | 4, barWeight = BAR_WEIGHT): FslSet[] => {
  const pct = BBS_PERCENTAGES[week]
  if (pct === null) return []
  return buildFixedSets(Math.max(barWeight, roundToNearest5(tm * pct)), 5, 'bbs', 10)
}

export interface AccessorySetCalc {
  setNumber: number
  weight: number
  reps: number
}

export const calcAccessorySets = (accessoryTm: number): AccessorySetCalc[] => {
  const weight = roundToNearest5(accessoryTm * ACCESSORY_PERCENTAGE)
  return Array.from({ length: ACCESSORY_SETS }, (_, i) => ({
    setNumber: i + 1,
    weight,
    reps: ACCESSORY_REPS,
  }))
}

export interface WarmupSet {
  setNumber: number
  weight: number
  reps: number
  type: 'warmup'
}

const WARMUP_PERCENTAGES: { pct: number; reps: number }[] = [
  { pct: 0.40, reps: 5 },
  { pct: 0.50, reps: 5 },
  { pct: 0.60, reps: 3 },
]

export const calcWarmup = (
  tm: number,
  workingWeight: number,
  barWeight = BAR_WEIGHT,
): WarmupSet[] => {
  const sets: WarmupSet[] = []
  for (const { pct, reps } of WARMUP_PERCENTAGES) {
    const weight = Math.max(barWeight, roundToNearest5(tm * pct))
    if (weight >= workingWeight) break
    if (sets.length > 0 && weight === sets[sets.length - 1].weight) continue
    sets.push({ setNumber: sets.length + 1, weight, reps, type: 'warmup' })
  }
  return sets
}

export const estimated1RM = (weight: number, reps: number): number =>
  reps === 1 ? weight : weight * (1 + reps / 30)

// Fewest AMRAP reps at todayWeight whose e1RM reaches prev1RM. A single rep
// scores plain weight (the estimated1RM reps===1 short-circuit), so when the
// weight already meets the target the answer is 1 — never 0 or negative. Below
// that, the Epley back-calc applies, floored at 2 because a 1-rep result can
// never reach a target above the weight itself.
export const targetReps = (prev1RM: number, todayWeight: number): number => {
  if (todayWeight <= 0 || todayWeight >= prev1RM) return 1
  return Math.max(2, Math.ceil((prev1RM / todayWeight - 1) * 30))
}

export interface AmrapTarget {
  label: string
  reps: number
  est1RM: number
}

export const calcAmrapTargets = (
  prevSets: Array<{ weight: number; reps: number; label: string }>,
  todayAmrapWeight: number
): AmrapTarget[] =>
  prevSets.map(({ weight, reps, label }) => {
    const est = estimated1RM(weight, reps)
    return {
      label,
      reps: targetReps(est, todayAmrapWeight),
      est1RM: Math.round(est * 100) / 100,
    }
  })

export const canAdvanceWeek = (completedOrSkipped: number): boolean =>
  completedOrSkipped >= 4

export const toSeconds = (mm: number, ss: number): number => mm * 60 + ss

export const fromSeconds = (total: number): { mm: number; ss: number } => ({
  mm: Math.floor(total / 60),
  ss: total % 60,
})

export const formatDuration = (seconds: number): string => {
  const { mm, ss } = fromSeconds(seconds)
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

// Which week's percentages drive supplemental + cross work. Weeks 1-3 always
// use their own week. The deload (week 4) is governed by the user's setting:
// skip → none, normal → week 1 (~65%), deload → week 4 (~40-60%). Returning
// null means "no supplemental this week". This is the single switch that keeps
// self-supplemental and cross-lift work consistent on the deload.
export const effectiveSupplementalWeek = (
  week: 1 | 2 | 3 | 4,
  mode: DeloadSupplemental,
): 1 | 2 | 3 | 4 | null => {
  if (week !== 4) return week
  if (mode === 'skip') return null
  if (mode === 'normal') return 1
  return 4
}

export function calcSupplementalSets(
  template: SupplementalTemplate,
  main: MainSet[],
  tm: number,
  week: 1 | 2 | 3 | 4,
  barWeight = BAR_WEIGHT,
): FslSet[] {
  if (main.length === 0) return []
  switch (template) {
    case 'fsl':     return calcFslSets(main[0].weight)
    case 'ssl':     return calcSslSets(main[1].weight)
    case 'bbb':     return calcBbbSets(tm, barWeight)
    case 'fsl+bbb': return calcFslBbbSets(main[0].weight)
    case 'ssl+bbb': return calcSslBbbSets(main[1].weight)
    case 'bbs':     return calcBbsSets(tm, week, barWeight)
    case 'none':    return []
  }
}

export function getSupplementalLabel(
  template: SupplementalTemplate,
  sets: FslSet[],
  week: 1 | 2 | 3 | 4,
): string | null {
  if (sets.length === 0) return null
  const count = `${sets.length} × ${sets[0].reps}`
  switch (template) {
    case 'fsl':     return `FSL  ${count}`
    case 'ssl':     return `SSL  ${count}`
    case 'bbb':     return `BBB  ${count}  ${Math.round(BBB_PCT * 100)}% TM`
    case 'fsl+bbb': return `FSL+BBB  ${count}`
    case 'ssl+bbb': return `SSL+BBB  ${count}`
    case 'bbs': {
      const pct = BBS_PERCENTAGES[week]
      return pct !== null ? `BBS  ${count}  ${Math.round(pct * 100)}% TM` : null
    }
    case 'none':    return null
  }
}

// ── Cross-lift supplemental ───────────────────────────────────────────────
// After the day's main + self-supplemental, run volume sets of *another* main
// lift's movement. Weight is FSL of that movement (its first main set for the
// week) or a straight percentage of its TM. Unlike FSL/SSL there is no source
// set in this session to cascade from — the weight is fixed from the other
// lift's TM.
export interface CrossSet {
  setNumber: number
  weight: number
  reps: number
  type: 'cross'
  liftId: number  // the movement lift
}

export interface CrossBlockConfig {
  movementLiftId: number
  weightMode: 'fsl' | 'percent'
  percent: number | null
  sets: number
  reps: number
}

export const calcCrossSets = (
  block: CrossBlockConfig,
  movementTm: number,
  week: 1 | 2 | 3 | 4,
  barWeight = BAR_WEIGHT,
): CrossSet[] => {
  const weight = block.weightMode === 'fsl'
    ? calcMainSets(movementTm, week, barWeight)[0].weight
    : Math.max(barWeight, roundToNearest5(movementTm * (block.percent ?? 0)))
  return Array.from({ length: Math.max(0, block.sets) }, (_, i) => ({
    setNumber: i + 1,
    weight,
    reps: block.reps,
    type: 'cross' as const,
    liftId: block.movementLiftId,
  }))
}

export const getCrossLabel = (
  block: { sets: number; reps: number; weightMode: 'fsl' | 'percent'; percent: number | null },
  movementName: string,
): string => {
  const mode = block.weightMode === 'fsl' ? 'FSL' : `${Math.round((block.percent ?? 0) * 100)}% TM`
  return `${movementName.toUpperCase()}  ${block.sets} × ${block.reps}  ${mode}`
}

export const calcPlatesPerSide = (
  targetWeight: number,
  barWeight: number,
  plates: PlateConfig[]
): PlateConfig[] | null => {
  const perSide = Math.round(((targetWeight - barWeight) / 2) * 100) / 100
  if (perSide < 0) return null
  if (perSide === 0) return []

  // Copy before sorting so we never mutate the caller's plate list. A count < 2
  // plate needs no filtering here: Math.floor(count / 2) below yields 0 pairs,
  // so it can never be selected.
  const sorted = [...plates].sort((a, b) => b.weight - a.weight)

  const result: PlateConfig[] = []
  let remaining = perSide
  for (const plate of sorted) {
    if (remaining <= 0) break
    const maxPairs = Math.floor(plate.count / 2)
    const pairsNeeded = Math.floor(remaining / plate.weight)
    const pairsToUse = Math.min(maxPairs, pairsNeeded)
    if (pairsToUse > 0) {
      result.push({ weight: plate.weight, count: pairsToUse })
      remaining = Math.round((remaining - pairsToUse * plate.weight) * 100) / 100
    }
  }
  return Math.abs(remaining) < 0.01 ? result : null
}

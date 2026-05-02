import type { PlateConfig } from '../db/db'

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

export const FSL_PERCENTAGE = 0.65
export const FSL_SETS = 5
export const FSL_REPS = 10

export const ACCESSORY_PERCENTAGE = 0.75
export const ACCESSORY_SETS = 5
export const ACCESSORY_REPS = 10

export const roundToNearest5 = (weight: number): number =>
  Math.round(weight / 5) * 5

export interface MainSet {
  setNumber: number
  weight: number
  reps: number
  isAmrap: boolean
  type: 'main'
}

export const calcMainSets = (tm: number, week: 1 | 2 | 3 | 4): MainSet[] => {
  const percentages = MAIN_PERCENTAGES[week]
  const reps = MAIN_REPS[week]
  return percentages.map((pct, i) => ({
    setNumber: i + 1,
    weight: roundToNearest5(tm * pct),
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

export const JOKER_INCREMENT = 0.05

export const JOKER_MIN_REPS: Record<number, number> = { 1: 5, 2: 3, 3: 1 }

export const calcNextJokerWeight = (prevWeight: number): number =>
  roundToNearest5(prevWeight * (1 + JOKER_INCREMENT))

export const calcJokerSet = (prevWeight: number, setNumber: number, reps: number): JokerSet => ({
  type: 'joker',
  setNumber,
  weight: calcNextJokerWeight(prevWeight),
  reps,
  isAmrap: false,
})

export const shouldShowJokerButton = (params: {
  week: 1 | 2 | 3 | 4
  loggedSets: ReadonlyArray<{ reps: number; type: string }>
  warmupCount: number
  mainCount: number
  jokerCount: number
}): boolean => {
  const { week, loggedSets, warmupCount, mainCount, jokerCount } = params
  if (week === 4) return false
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
  type: 'fsl'
}

export const calcFslSets = (tm: number): FslSet[] => {
  const weight = roundToNearest5(tm * FSL_PERCENTAGE)
  return Array.from({ length: FSL_SETS }, (_, i) => ({
    setNumber: i + 1,
    weight,
    reps: FSL_REPS,
    type: 'fsl',
  }))
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

export const calcWarmup = (
  tm: number,
  workingWeight: number,
  liftType: 'upper' | 'lower'
): WarmupSet[] => {
  const barWeight = 45
  const base = liftType === 'lower' ? 135 : 95
  const increment = Math.round((tm * 0.1) / 5) * 5

  const sets: WarmupSet[] = [
    { setNumber: 1, weight: barWeight, reps: 10, type: 'warmup' }
  ]

  if (base >= workingWeight) return sets

  let current = base
  let setNumber = 2

  while (current + increment < workingWeight) {
    sets.push({ setNumber, weight: current, reps: 5, type: 'warmup' })
    current += increment
    setNumber++
  }

  sets.push({ setNumber, weight: current, reps: 3, type: 'warmup' })

  return sets
}

export const estimated1RM = (weight: number, reps: number): number =>
  weight * (1 + reps / 30)

export const targetReps = (prev1RM: number, todayWeight: number): number =>
  Math.ceil((prev1RM / todayWeight - 1) * 30)

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

export const calcPlatesPerSide = (
  targetWeight: number,
  barWeight: number,
  plates: PlateConfig[]
): PlateConfig[] | null => {
  const perSide = Math.round(((targetWeight - barWeight) / 2) * 100) / 100
  if (perSide < 0) return null
  if (perSide === 0) return []

  const sorted = [...plates]
    .filter(p => p.count >= 2)
    .sort((a, b) => b.weight - a.weight)

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

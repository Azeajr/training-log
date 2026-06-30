export type SupplementalTemplate = 'fsl' | 'ssl' | 'bbb' | 'fsl+bbb' | 'ssl+bbb' | 'bbs' | 'none'
export type SupplementalSetType = Exclude<SupplementalTemplate, 'none'>

// How supplemental + cross-lift work behaves on the week-4 deload:
//   skip   — none (deload = main triples only)
//   deload — computed at the week-4 deload percentages (~40-60%)
//   normal — computed at week-1 percentages (~65%), "it's already light"
export type DeloadSupplemental = 'skip' | 'deload' | 'normal'

export interface Lift {
  id?: number
  name: string
  order: number
  progressionIncrement: number
  baseWeight: number
  liftType: 'upper' | 'lower'
  archived?: boolean
  // Whether this lift's sets load a barbell. undefined/true ⇒ barbell, so plate
  // math is shown (matches existing behaviour); explicit false hides plate math
  // for a non-barbell main lift (machine, dumbbell, weighted bodyweight).
  usesBarbell?: boolean
}

// A cross-lift supplemental block: after the day's main + self-supplemental,
// run `sets`×`reps` of another main lift's movement. Weight is either FSL of
// that movement lift for the week, or a straight percentage of its TM.
export interface LiftSupplemental {
  id?: number
  liftId: number          // the training day this block runs on
  movementLiftId: number  // which main lift's movement + TM to load
  weightMode: 'fsl' | 'percent'
  percent: number | null  // fraction (e.g. 0.75) when weightMode === 'percent'
  sets: number
  reps: number
  order: number
}

export interface TrainingMax {
  id?: number
  liftId: number
  weight: number
  setAt: Date
}

export interface Cycle {
  id?: number
  number: number
  startDate: Date
  endDate: Date | null
  // Highest contiguous week fully completed under the roster active at the time.
  // Weeks <= this are frozen complete, so editing the lift roster mid-cycle
  // never reopens finished weeks. 0 = nothing closed yet.
  closedThroughWeek?: number
}

export interface Session {
  id?: number
  cycleId: number
  liftId: number
  week: 1 | 2 | 3 | 4
  date: Date
  notes: string | null
  status: 'pending' | 'completed' | 'skipped'
}

export interface Set {
  id?: number
  sessionId: number
  type: 'warmup' | 'main' | 'joker' | 'cross' | SupplementalSetType
  setNumber: number
  weight: number
  reps: number
  isAmrap: boolean
  // For 'cross' sets: the movement lift trained. null/undefined means the
  // set belongs to the session's own lift (every non-cross set).
  liftId?: number | null
}

// Wendler assistance buckets. The accessory picker groups these into three
// sections: push, pull, and legs/core (legs + core merged into the lower-body
// + midsection slot).
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core'

export interface Exercise {
  id?: number
  name: string
  type: 'reps' | 'timed' | 'distance'
  category?: ExerciseCategory
  archived?: boolean
  // Whether this assistance exercise loads a barbell. undefined/false ⇒ not a
  // barbell, so no plate math (matches existing behaviour); explicit true opts a
  // barbell accessory (e.g. Barbell Row, RDL) into the plate-math readout.
  usesBarbell?: boolean
}

export interface AccessoryTrainingMax {
  id?: number
  exerciseId: number
  weight: number
  incrementLb: number
  setAt: Date
}

export interface AccessorySet {
  id?: number
  sessionId: number
  exerciseId: number
  setNumber: number
  weight: number | null
  reps: number | null
  duration: number | null
  distance: number | null
}

export interface PlateConfig {
  weight: number
  count: number
}

export interface Settings {
  id?: number
  restTimer1: number
  restTimer2: number
  restTimerFail: number
  theme?: string
  barWeight?: number
  plates?: PlateConfig[]
  supplementalTemplate?: SupplementalTemplate
  deloadSupplemental?: DeloadSupplemental
  // Whether cycles include a week-4 deload. false = 3-week cycle: after week 3
  // completes, TMs progress and the next cycle begins, with no light week. When
  // false the deloadSupplemental setting is moot (no deload week to govern).
  hasDeloadWeek?: boolean
}

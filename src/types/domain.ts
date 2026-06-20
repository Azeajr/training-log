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

export interface Exercise {
  id?: number
  name: string
  type: 'reps' | 'timed' | 'distance'
  archived?: boolean
}

export interface LiftAccessory {
  id?: number
  liftId: number
  exerciseId: number
  order: number
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
}

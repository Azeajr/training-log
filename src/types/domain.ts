export type SupplementalTemplate = 'fsl' | 'ssl' | 'bbb' | 'fsl+bbb' | 'ssl+bbb' | 'bbs' | 'none'
export type SupplementalSetType = Exclude<SupplementalTemplate, 'none'>

// How supplemental + cross-lift work behaves on the week-4 deload:
//   skip   — none (deload = main triples only)
//   deload — computed at the week-4 deload percentages (~40-60%)
//   normal — computed at week-1 percentages (~65%), "it's already light"
export type DeloadSupplemental = 'skip' | 'deload' | 'normal'

// How a set's plate-loading readout is computed/displayed:
//   none   — not plate-loaded (dumbbell/cable-stack/bodyweight): no readout
//   paired — symmetric 2-end load (barbell, hex bar, two-sided plate cable):
//            (target − base) / 2 per side, plates in pairs, "each side: …"
//   total  — single stack, no sides (belt squat, dip belt, weighted pull-up,
//            plate machine): target − base, plates as singles, "plates: …"
export type PlateMode = 'none' | 'paired' | 'total'

export interface Lift {
  id?: number
  name: string
  order: number
  progressionIncrement: number
  baseWeight: number
  liftType: 'upper' | 'lower'
  archived?: boolean
  // Plate-loading model. `plateMode` undefined falls back to `usesBarbell`
  // (see resolveLiftLoading). `implementBase` is the weight present before plates
  // (bar/carriage); undefined ⇒ mode default (paired→global barWeight, total→0),
  // which lets standard-bar lifts track the global bar setting.
  plateMode?: PlateMode
  implementBase?: number | null
  // Legacy v1 flag, kept as the fallback source for `plateMode`. undefined/true ⇒
  // barbell (paired); explicit false ⇒ none.
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
  // Plate-loading model (see Lift). `plateMode` undefined falls back to
  // `usesBarbell` via resolveExerciseLoading; default for an accessory is `none`.
  plateMode?: PlateMode
  implementBase?: number | null
  // Legacy v1 flag, kept as the fallback source for `plateMode`. explicit true ⇒
  // paired (barbell accessory); undefined/false ⇒ none.
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

// A free-text note on one exercise within one session (what band, swapped to
// an easier variation after set 3, etc.) — scoped to (sessionId, exerciseId),
// distinct from the whole-session `Session.notes` and from any single set.
export interface AccessoryNote {
  id?: number
  sessionId: number
  exerciseId: number
  notes: string
}

// The lift's persisted pick for one assistance section — the "default" that
// seeds a new session's accessory slot and is overwritten whenever the user
// swaps to something else (in a session, or from the Today screen).
export interface AssistanceDefault {
  id?: number
  liftId: number
  section: 'push' | 'pull' | 'legs_core'
  exerciseId: number
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

export type SupplementalTemplate = 'fsl' | 'ssl' | 'bbb' | 'fsl+bbb' | 'ssl+bbb' | 'bbs' | 'none'
export type SupplementalSetType = Exclude<SupplementalTemplate, 'none'>

// How supplemental + cross-lift work behaves on the week-4 deload:
//   skip   — none (deload = main triples only)
//   deload — computed at the week-4 deload percentages (~40-60%)
//   normal — computed at week-1 percentages (~65%), "it's already light"
export type DeloadSupplemental = 'skip' | 'deload' | 'normal'

// How much reps>10 on an AMRAP set should be discounted in estimated1RM — high-rep
// sets are less reliable strength indicators than low-rep ones. 'off' = no discount
// (plain Wathan). See calc.ts estimated1RM for the compression mechanics.
export type HighRepDiscount = 'off' | 'mild' | 'moderate' | 'aggressive'

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

/**
 * Where a training-max row came from.
 *
 * Recorded rather than inferred. It used to be worked out from a 60-second
 * window around the cycle's creation, so whether a lift stayed eligible for a
 * doubled increment depended on **how long the user took to tap the button** —
 * racking a bar or answering a text between the roll-over and the tap changed
 * the program's behaviour a cycle later, with nothing on screen to explain it
 * (F39). Legacy rows carry `null`, which the readers still infer for.
 */
export type TmSource = 'progression' | 'manual' | 'deload'

export interface TrainingMax {
  id?: number
  liftId: number
  weight: number
  setAt: Date
  /** Null on rows written before the column existed. */
  source?: TmSource | null
  /** The cycle this row was written for; null on legacy rows. */
  cycleId?: number | null
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

// The three assistance slots a session fills (legs + core collapse into one).
// Lives here beside ExerciseCategory as the single source of truth; lib/assistance
// re-exports it with the section labels and category→section mapping.
export type AssistanceSection = 'push' | 'pull' | 'legs_core'

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
  section: AssistanceSection
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
  // Opt-in system notification when a rest-timer threshold is reached (off by
  // default; permission requested from a Settings gesture, not on first load).
  restTimerNotifications?: boolean
  highRepDiscount?: HighRepDiscount
}

// ---------------------------------------------------------------------------
// PT (physical therapy)
//
// A rehab checklist, deliberately NOT a training session. The 5/3/1 side of the
// app exists to answer "how strong am I" — it derives training maxes, records
// and e1RM from what was logged. A PT routine answers one question only: did I
// do the work today. Nothing here feeds `performance.ts`, `pr.ts` or any TM
// calculation, which is exactly why it gets its own tables rather than riding
// on `exercises` + `accessorySets` (those hang off a 5/3/1 `sessions` row and
// would need a synthetic session per rehab day to exist at all).
// ---------------------------------------------------------------------------

/** What one prescribed set is counted in. */
export type PtMeasure = 'reps' | 'time' | 'distance'

/**
 * The unit a distance target is written in, stored per exercise.
 *
 * Carried explicitly because the accessory log hardcodes feet at the render
 * site (`accessorySetValue`) while the CSV header calls the same column
 * `distance_m` — the number is unit-less in the database and the two readers
 * already disagree about it. A sled walk prescribed in yards must read back in
 * yards, so PT stores the unit with the value instead of inheriting that.
 */
export type PtDistanceUnit = 'yd' | 'm' | 'ft'

/**
 * How resistance is expressed for an exercise. Orthogonal to `PtMeasure`: a
 * backward sled walk is 50 yd (measure) at 180 lb (resistance), and a band
 * pull-apart is 15 reps (measure) on a red band (resistance).
 */
export type PtResistanceKind = 'none' | 'weight' | 'band'

/** A saved PT checklist — the prescription, not a performance of it. */
export interface PtRoutine {
  id?: number
  name: string
  notes?: string | null
  order: number
  archived?: boolean
}

/** One exercise within a routine, with its prescription. */
export interface PtExercise {
  id?: number
  routineId: number
  name: string
  description?: string | null
  /** http/https only — validated on save, see `isSafeVideoUrl` in lib/pt.ts. */
  videoUrl?: string | null
  /** How many sets to tick off. Always >= 1. */
  sets: number
  measure: PtMeasure
  /** Set for measure 'reps'; null otherwise. */
  targetReps?: number | null
  /** Set for measure 'time'; null otherwise. */
  targetSeconds?: number | null
  /** Set for measure 'distance'; null otherwise, paired with `distanceUnit`. */
  targetDistance?: number | null
  distanceUnit?: PtDistanceUnit | null
  resistanceKind: PtResistanceKind
  /** Set for resistanceKind 'weight' (lb); null otherwise. */
  resistanceWeight?: number | null
  /** Optional box/step height, independent of resistance and repetition target. */
  equipmentHeight?: number | null
  equipmentHeightUnit?: 'in' | 'cm' | null
  /** Set for resistanceKind 'band' (free text: "red", "green doubled"). */
  resistanceBand?: string | null
  order: number
  /**
   * Dropped from the checklist but kept for history. An exercise that has never
   * been run is deleted outright on save; one with `ptSetChecks` rows against it
   * is archived instead, so a past run still renders the name of what was done
   * rather than a dangling id.
   */
  archived?: boolean
}

/**
 * One dated run of a routine.
 *
 * There is no `status` column and no pending row, unlike `sessions`. A run is
 * buffered in `store/pt-store` and written here only when the user finishes it,
 * so every row that exists is a run that happened. That also means abandoning a
 * run leaves nothing behind to reconcile — the whole class of store-vs-DB drift
 * that COMMON_MISTAKES #5 documents for workouts cannot arise here.
 */
export interface PtSession {
  id?: number
  routineId: number
  date: Date
  notes?: string | null
}

/**
 * One prescribed set of one exercise in one run, ticked or not.
 *
 * A row is written for every prescribed set, including the ones left unticked —
 * that is what makes "6/8" a fact about the run rather than an inference from
 * how many rows happen to be present.
 */
export interface PtSetCheck {
  id?: number
  sessionId: number
  ptExerciseId: number
  setNumber: number
  done: boolean
  /**
   * What was actually done, resolved at the moment the run was saved.
   *
   * These are filled even when they match the prescription, because the
   * prescription is editable: raising an exercise's target later must not
   * rewrite what a finished run says happened. All eight null together means a
   * row from before PT recorded anything but a tick, and only those fall back to
   * the exercise's own fields.
   */
  reps?: number | null
  seconds?: number | null
  distance?: number | null
  distanceUnit?: PtDistanceUnit | null
  weight?: number | null
  band?: string | null
  equipmentHeight?: number | null
  equipmentHeightUnit?: 'in' | 'cm' | null
}

/** Free-text note on one exercise within one run ("switched to green band"). */
export interface PtNote {
  id?: number
  sessionId: number
  ptExerciseId: number
  notes: string
}

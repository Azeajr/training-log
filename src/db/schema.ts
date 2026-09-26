export const SCHEMA = `
CREATE TABLE IF NOT EXISTS lifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  progressionIncrement REAL NOT NULL,
  baseWeight REAL NOT NULL,
  liftType TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trainingMaxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liftId INTEGER NOT NULL,
  weight REAL NOT NULL,
  setAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycleId INTEGER NOT NULL,
  liftId INTEGER NOT NULL,
  week INTEGER NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  type TEXT NOT NULL,
  setNumber INTEGER NOT NULL,
  weight REAL NOT NULL,
  reps INTEGER NOT NULL,
  isAmrap INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  archived INTEGER
);
CREATE TABLE IF NOT EXISTS liftSupplementals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liftId INTEGER NOT NULL,
  movementLiftId INTEGER NOT NULL,
  weightMode TEXT NOT NULL,
  percent REAL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  "order" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accessoryTrainingMaxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exerciseId INTEGER NOT NULL,
  weight REAL NOT NULL,
  incrementLb REAL NOT NULL,
  setAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accessorySets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  exerciseId INTEGER NOT NULL,
  setNumber INTEGER NOT NULL,
  weight REAL,
  reps INTEGER,
  duration REAL,
  distance REAL
);
CREATE TABLE IF NOT EXISTS accessoryNotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  exerciseId INTEGER NOT NULL,
  notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assistanceDefaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liftId INTEGER NOT NULL,
  section TEXT NOT NULL,
  exerciseId INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ptRoutines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT,
  "order" INTEGER NOT NULL,
  archived INTEGER
);
CREATE TABLE IF NOT EXISTS ptExercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routineId INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  videoUrl TEXT,
  sets INTEGER NOT NULL,
  measure TEXT NOT NULL,
  targetReps INTEGER,
  targetSeconds REAL,
  targetDistance REAL,
  distanceUnit TEXT,
  resistanceKind TEXT NOT NULL,
  resistanceWeight REAL,
  resistanceBand TEXT,
  equipmentHeight REAL,
  equipmentHeightUnit TEXT,
  "order" INTEGER NOT NULL,
  archived INTEGER
);
CREATE TABLE IF NOT EXISTS ptSessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routineId INTEGER NOT NULL,
  date TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS ptSetChecks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  ptExerciseId INTEGER NOT NULL,
  setNumber INTEGER NOT NULL,
  done INTEGER NOT NULL,
  reps INTEGER,
  seconds REAL,
  distance REAL,
  distanceUnit TEXT,
  weight REAL,
  band TEXT,
  equipmentHeight REAL,
  equipmentHeightUnit TEXT,
  recorded INTEGER,
  measure TEXT,
  resistanceKind TEXT
);
CREATE TABLE IF NOT EXISTS ptNotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  ptExerciseId INTEGER NOT NULL,
  notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restTimer1 INTEGER NOT NULL,
  restTimer2 INTEGER NOT NULL,
  restTimerFail INTEGER NOT NULL,
  theme TEXT,
  barWeight REAL,
  plates TEXT,
  supplementalTemplate TEXT,
  restTimerNotifications INTEGER,
  bands TEXT
);
CREATE INDEX IF NOT EXISTS idx_trainingMaxes_liftId ON trainingMaxes(liftId);
CREATE INDEX IF NOT EXISTS idx_sessions_cycleId ON sessions(cycleId);
CREATE INDEX IF NOT EXISTS idx_sessions_liftId ON sessions(liftId);
CREATE INDEX IF NOT EXISTS idx_sets_sessionId ON sets(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessorySets_sessionId ON accessorySets(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessoryNotes_sessionId ON accessoryNotes(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessoryTrainingMaxes_exerciseId ON accessoryTrainingMaxes(exerciseId);
CREATE INDEX IF NOT EXISTS idx_liftSupplementals_liftId ON liftSupplementals(liftId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistanceDefaults_lift_section ON assistanceDefaults(liftId, section);
CREATE INDEX IF NOT EXISTS idx_ptExercises_routineId ON ptExercises(routineId);
CREATE INDEX IF NOT EXISTS idx_ptSessions_routineId ON ptSessions(routineId);
CREATE INDEX IF NOT EXISTS idx_ptSetChecks_sessionId ON ptSetChecks(sessionId);
CREATE INDEX IF NOT EXISTS idx_ptNotes_sessionId ON ptNotes(sessionId);
-- Both PT unique indexes sit in SCHEMA and not in ADDITIVE_MIGRATIONS,
-- which is the opposite of idx_accessoryNotes_session_exercise above. The
-- rule there is about existing rows: SCHEMA exec is unguarded and runs on
-- every boot, so an index that CAN fail against data already on disk would
-- brick that database. These two tables ship in the same release as their
-- indexes, so no database can hold a violating row before the index exists.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptSetChecks_session_exercise_set ON ptSetChecks(sessionId, ptExerciseId, setNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptNotes_session_exercise ON ptNotes(sessionId, ptExerciseId);
`

export const ADDITIVE_MIGRATIONS = [
  // Optional JSON calibration/snapshots; old rows remain unchanged and readable.
  `ALTER TABLE lifts ADD COLUMN bandProfile TEXT`,
  `ALTER TABLE exercises ADD COLUMN bandProfile TEXT`,
  `ALTER TABLE sets ADD COLUMN bandLoad TEXT`,
  `ALTER TABLE accessorySets ADD COLUMN bandLoad TEXT`,
  `ALTER TABLE accessorySets ADD COLUMN dropRounds TEXT`,
  `ALTER TABLE settings ADD COLUMN supplementalTemplate TEXT`,
  `ALTER TABLE lifts ADD COLUMN archived INTEGER`,
  `ALTER TABLE cycles ADD COLUMN closedThroughWeek INTEGER`,
  `ALTER TABLE sets ADD COLUMN liftId INTEGER`,
  `ALTER TABLE settings ADD COLUMN deloadSupplemental TEXT`,
  `ALTER TABLE exercises ADD COLUMN category TEXT`,
  `ALTER TABLE settings ADD COLUMN hasDeloadWeek INTEGER`,
  // Equipment-aware plate math. NULL (default) means: barbell for lifts (plate
  // math shown), non-barbell for exercises (no plate math) — preserving prior
  // behaviour without backfilling existing rows.
  `ALTER TABLE lifts ADD COLUMN usesBarbell INTEGER`,
  `ALTER TABLE exercises ADD COLUMN usesBarbell INTEGER`,
  // v2 plate-loading: paired/total mode + implement base weight (bar/carriage).
  // Both NULL by default — resolver falls back to usesBarbell, so no backfill.
  `ALTER TABLE lifts ADD COLUMN plateMode TEXT`,
  `ALTER TABLE lifts ADD COLUMN implementBase REAL`,
  `ALTER TABLE exercises ADD COLUMN plateMode TEXT`,
  `ALTER TABLE exercises ADD COLUMN implementBase REAL`,
  // Roster concept removed: the per-lift assistance assignment table is unused.
  // First destructive migration — safe because nothing reads it and it held no
  // training history (only assignments; logged sets live in accessorySets).
  `DROP TABLE IF EXISTS liftAccessories`,
  // One note per (session, exercise) — readers assume it (Map last-wins would
  // silently hide dupes). Deliberately here and not in SCHEMA: SCHEMA exec is
  // unguarded, so a DB that already holds dupes would fail every boot; as a
  // migration the error is swallowed and that DB just skips the index.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_accessoryNotes_session_exercise ON accessoryNotes(sessionId, exerciseId)`,
  `ALTER TABLE settings ADD COLUMN highRepDiscount TEXT`,
  `ALTER TABLE settings ADD COLUMN restTimerNotifications INTEGER`,
  // One exercise per name, case- and whitespace-insensitively. The application
  // already enforced this (assertUniqueExerciseName) but only as a check-then-
  // act with nothing behind it: two concurrent creates both passed, and an
  // imported backup restored duplicates verbatim. Once duplicated, the repair
  // path closed too — renaming either twin rejected because the check saw the
  // other. Same placement reasoning as idx_accessoryNotes_session_exercise
  // above: SCHEMA exec is unguarded and runs on every boot, so a DB that
  // already holds duplicates would fail to start; as a migration the error is
  // swallowed and that DB simply skips the index.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name_nocase ON exercises(TRIM(LOWER(name)))`,
  // Cross sets are attributed by their own liftId, so every record reader scans
  // `sets` by liftId — detectPRs (the mid-set toast, on the logging path),
  // baselineSets, and getRecentWorkingSets. There was an index on sessionId and
  // none on liftId, so those were full scans growing with total history (F94).
  //
  // HERE ONLY, not in SCHEMA: `sets.liftId` is itself an additive column, so
  // SCHEMA runs before it exists and an index on it fails with "no such column".
  // Non-unique, so it cannot fail against existing rows.
  `CREATE INDEX IF NOT EXISTS idx_sets_liftId ON sets(liftId)`,
  // Reconcile duplicate exercise names, then (re)create the unique index.
  //
  // `idx_exercises_name_nocase` above is an additive migration, and migrations
  // run inside a swallowed try/catch — deliberately, so a database that already
  // held duplicates still boots. The consequence was that exactly those installs
  // silently kept NO uniqueness guarantee, and nothing told them (F101).
  //
  // Suffix the later twins with their id rather than merging or deleting: the
  // rows carry logged history through accessorySets, so dropping one loses work.
  // The earliest id keeps the plain name. Idempotent — once names are unique the
  // UPDATE matches nothing, and the index below already exists on healthy DBs.
  `UPDATE exercises SET name = name || ' (' || id || ')'
     WHERE id NOT IN (SELECT MIN(id) FROM exercises GROUP BY TRIM(LOWER(name)))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name_nocase ON exercises(TRIM(LOWER(name)))`,
  // One cross-lift block per (lift, movement). Logged cross sets carry only the
  // movement's liftId and never a block identity, so `composeCrossSets` matches
  // a logged set to EVERY block on that movement: two blocks on the same
  // movement plus one logged set marked set 1 of both done and overrode the
  // remainder of both. `LiftSetupModal` already prevents duplicates by filtering
  // the picker, but that was a UI rule with nothing behind it — an imported
  // backup restored duplicates verbatim (F31).
  //
  // The twin is deleted rather than renamed (unlike the exercise dedupe above,
  // where the row carries logged history): a block is a prescription, and the
  // sets logged against it reference the *movement*, so the surviving block
  // still owns every one of them. Same placement reasoning as the two unique
  // indexes above — SCHEMA exec is unguarded and runs on every boot, so a
  // database already holding duplicates would fail to start.
  `DELETE FROM liftSupplementals
     WHERE id NOT IN (SELECT MIN(id) FROM liftSupplementals GROUP BY liftId, movementLiftId)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_liftSupplementals_lift_movement
     ON liftSupplementals(liftId, movementLiftId)`,
  // Provenance for training maxes, recorded instead of inferred. Whether a row
  // came from auto-progression, the user, or a deload was worked out from a
  // 60-second window around the cycle's creation — so a lift's eligibility for
  // a doubled increment a whole cycle later turned on how long the user took to
  // tap a button (F39). `cycleId` scopes it: without that, a deload cannot tell
  // a second tap from next cycle's deload, which is why `deloadTms` could not
  // be made idempotent (F100).
  //
  // Both nullable with no backfill: old rows genuinely have no recorded
  // provenance, and claiming one would be a guess. The readers treat null as
  // "unknown" and fall back to the old inference for those rows only.
  `ALTER TABLE trainingMaxes ADD COLUMN source TEXT`,
  `ALTER TABLE trainingMaxes ADD COLUMN cycleId INTEGER`,
  // Box/step height, kept apart from resistance so a bodyweight step-down and a
  // loaded one both record it. Nullable with no backfill: an existing routine
  // genuinely has no recorded height, and the prescription line omits it.
  `ALTER TABLE ptExercises ADD COLUMN equipmentHeight REAL`,
  `ALTER TABLE ptExercises ADD COLUMN equipmentHeightUnit TEXT`,
  // What was actually done, per set, as opposed to what was prescribed. NULL
  // across all eight means a row written before PT recorded anything but a
  // tick — those and only those fall back to the exercise's prescription. A row
  // written since carries its resolved values even when they match, because the
  // prescription is editable and would otherwise rewrite finished history.
  `ALTER TABLE ptSetChecks ADD COLUMN reps INTEGER`,
  `ALTER TABLE ptSetChecks ADD COLUMN seconds REAL`,
  `ALTER TABLE ptSetChecks ADD COLUMN distance REAL`,
  `ALTER TABLE ptSetChecks ADD COLUMN distanceUnit TEXT`,
  `ALTER TABLE ptSetChecks ADD COLUMN weight REAL`,
  `ALTER TABLE ptSetChecks ADD COLUMN band TEXT`,
  `ALTER TABLE ptSetChecks ADD COLUMN equipmentHeight REAL`,
  `ALTER TABLE ptSetChecks ADD COLUMN equipmentHeightUnit TEXT`,
  // Says outright that the eight columns above are this set's own record,
  // rather than leaving readers to infer it from "are they all NULL". That
  // inference is not safe: a bodyweight set of an unloaded, un-boxed exercise
  // legitimately resolves every one of them to NULL, and an import can carry
  // exactly such a row. NULL here means a row written before PT recorded
  // anything but a tick, which is the only case that falls back to the
  // prescription.
  `ALTER TABLE ptSetChecks ADD COLUMN recorded INTEGER`,
  // The context the eight actuals were recorded under, pinned the same way and
  // for the same reason they are. Without it a reader has only the CURRENT
  // prescription to decide which fields a row even has, so taking an exercise
  // to bodyweight made every weight ever logged under it unreadable — and, via
  // the run editor, unwritten. NULL means a row written before these columns
  // existed; those and only those infer their context from what they stored.
  `ALTER TABLE ptSetChecks ADD COLUMN measure TEXT`,
  `ALTER TABLE ptSetChecks ADD COLUMN resistanceKind TEXT`,
  // The bands you own, and how many of each: equipment, like plates. NULL on
  // a database from before it existed; `reconcileBandInventory` fills it from
  // the bands its movements already calibrate.
  `ALTER TABLE settings ADD COLUMN bands TEXT`,
] as const

export const ALL_TABLES = [
  'lifts', 'trainingMaxes', 'cycles', 'sessions', 'sets',
  'exercises', 'liftSupplementals',
  'accessoryTrainingMaxes', 'accessorySets', 'accessoryNotes', 'settings',
  'assistanceDefaults',
  'ptRoutines', 'ptExercises', 'ptSessions', 'ptSetChecks', 'ptNotes',
] as const

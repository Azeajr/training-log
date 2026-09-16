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
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restTimer1 INTEGER NOT NULL,
  restTimer2 INTEGER NOT NULL,
  restTimerFail INTEGER NOT NULL,
  theme TEXT,
  barWeight REAL,
  plates TEXT,
  supplementalTemplate TEXT,
  restTimerNotifications INTEGER
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
`

export const ADDITIVE_MIGRATIONS = [
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
] as const

export const ALL_TABLES = [
  'lifts', 'trainingMaxes', 'cycles', 'sessions', 'sets',
  'exercises', 'liftSupplementals',
  'accessoryTrainingMaxes', 'accessorySets', 'accessoryNotes', 'settings',
  'assistanceDefaults',
] as const

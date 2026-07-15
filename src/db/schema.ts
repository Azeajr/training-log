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
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restTimer1 INTEGER NOT NULL,
  restTimer2 INTEGER NOT NULL,
  restTimerFail INTEGER NOT NULL,
  theme TEXT,
  barWeight REAL,
  plates TEXT,
  supplementalTemplate TEXT
);
CREATE INDEX IF NOT EXISTS idx_trainingMaxes_liftId ON trainingMaxes(liftId);
CREATE INDEX IF NOT EXISTS idx_sessions_cycleId ON sessions(cycleId);
CREATE INDEX IF NOT EXISTS idx_sessions_liftId ON sessions(liftId);
CREATE INDEX IF NOT EXISTS idx_sets_sessionId ON sets(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessorySets_sessionId ON accessorySets(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessoryNotes_sessionId ON accessoryNotes(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessoryTrainingMaxes_exerciseId ON accessoryTrainingMaxes(exerciseId);
CREATE INDEX IF NOT EXISTS idx_liftSupplementals_liftId ON liftSupplementals(liftId);
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
] as const

export const ALL_TABLES = [
  'lifts', 'trainingMaxes', 'cycles', 'sessions', 'sets',
  'exercises', 'liftSupplementals',
  'accessoryTrainingMaxes', 'accessorySets', 'accessoryNotes', 'settings',
] as const

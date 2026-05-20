/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

type InMsg =
  | { id: number; type: 'init' }
  | { id: number; type: 'query'; sql: string; params: unknown[] }
  | { id: number; type: 'run'; sql: string; params: unknown[] }
  | { id: number; type: 'begin' }
  | { id: number; type: 'commit' }
  | { id: number; type: 'rollback' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  progressionIncrement REAL NOT NULL,
  baseWeight REAL NOT NULL,
  liftType TEXT NOT NULL,
  supplementalTemplate TEXT NOT NULL DEFAULT 'fsl+bbb'
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
  archived INTEGER
);
CREATE TABLE IF NOT EXISTS liftAccessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liftId INTEGER NOT NULL,
  exerciseId INTEGER NOT NULL,
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
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restTimer1 INTEGER NOT NULL,
  restTimer2 INTEGER NOT NULL,
  restTimerFail INTEGER NOT NULL,
  theme TEXT,
  barWeight REAL,
  plates TEXT
);
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY
);
CREATE INDEX IF NOT EXISTS idx_trainingMaxes_liftId ON trainingMaxes(liftId);
CREATE INDEX IF NOT EXISTS idx_sessions_cycleId ON sessions(cycleId);
CREATE INDEX IF NOT EXISTS idx_sessions_liftId ON sessions(liftId);
CREATE INDEX IF NOT EXISTS idx_sets_sessionId ON sets(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessorySets_sessionId ON accessorySets(sessionId);
CREATE INDEX IF NOT EXISTS idx_accessoryTrainingMaxes_exerciseId ON accessoryTrainingMaxes(exerciseId);
`

function runMigrations() {
  // One-time: lift supplementalTemplate default 'fsl' → 'fsl+bbb'
  const liftMigRan = db.selectValue("SELECT COUNT(*) FROM migrations WHERE id = 'lift_default_fsl_bbb'") as number
  if (!liftMigRan) {
    db.exec("UPDATE lifts SET supplementalTemplate = 'fsl+bbb' WHERE supplementalTemplate = 'fsl'")
    db.exec("INSERT OR IGNORE INTO migrations (id) VALUES ('lift_default_fsl_bbb')")
  }
  // Idempotent: old 'fsl' sets with reps=10 were FSL+BBB
  db.exec("UPDATE sets SET type = 'fsl+bbb' WHERE type = 'fsl' AND reps = 10")
}

async function init(): Promise<{ persistent: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlite3 = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} })
  if ('installOpfsSAHPoolVfs' in sqlite3) {
    // SAH pool locks files exclusively; previous worker may not have released handles yet — retry
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poolUtil = await (sqlite3 as any).installOpfsSAHPoolVfs({})
        db = new poolUtil.OpfsSAHPoolDb('/training-log.db')
        db.exec(SCHEMA)
        try { db.exec("ALTER TABLE lifts ADD COLUMN supplementalTemplate TEXT NOT NULL DEFAULT 'fsl'") } catch { /* column exists */ }
        runMigrations()
        return { persistent: true }
      } catch {
        if (attempt < 9) await new Promise(r => setTimeout(r, 150))
      }
    }
    console.warn('[sqlite] OPFS SAH pool unavailable after retries, falling back to in-memory')
  }
  db = new sqlite3.oo1.DB()
  db.exec(SCHEMA)
  try { db.exec("ALTER TABLE lifts ADD COLUMN supplementalTemplate TEXT NOT NULL DEFAULT 'fsl'") } catch { /* column exists */ }
  runMigrations()
  return { persistent: false }
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, type } = e.data
  try {
    if (type === 'init') {
      const result = await init()
      self.postMessage({ id, result })
      return
    }
    if (!db) throw new Error('DB not initialized')

    if (type === 'query') {
      const { sql, params } = e.data as { id: number; type: 'query'; sql: string; params: unknown[] }
      const rows: Record<string, unknown>[] = []
      db.exec({ sql, bind: params, rowMode: 'object', resultRows: rows })
      self.postMessage({ id, result: rows })
    } else if (type === 'run') {
      const { sql, params } = e.data as { id: number; type: 'run'; sql: string; params: unknown[] }
      db.exec({ sql, bind: params })
      const lastInsertRowid = db.selectValue('SELECT last_insert_rowid()') as number
      const changes = db.changes() as number
      self.postMessage({ id, result: { lastInsertRowid, changes } })
    } else if (type === 'begin') {
      db.exec('BEGIN')
      self.postMessage({ id, result: null })
    } else if (type === 'commit') {
      db.exec('COMMIT')
      self.postMessage({ id, result: null })
    } else if (type === 'rollback') {
      db.exec('ROLLBACK')
      self.postMessage({ id, result: null })
    }
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}

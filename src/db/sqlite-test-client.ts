// In-process SQLite client used by vitest. Backed by @sqlite.org/sqlite-wasm
// running synchronously (no worker, no OPFS). Vite alias swaps the production
// `./sqlite-client` import to this module under test.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SCHEMA, ADDITIVE_MIGRATIONS, ALL_TABLES } from './schema'
import { createTransactionRunner, type TransactionRunner } from './transaction'

type RunResult = { lastInsertRowid: number; changes: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

async function init(): Promise<{ persistent: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlite3 = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} })
  db = new sqlite3.oo1.DB()
  db.exec(SCHEMA)
  for (const sql of ADDITIVE_MIGRATIONS) {
    try { db.exec(sql) } catch { /* column exists */ }
  }
  return { persistent: false }
}

class TestSqliteClient {
  private runTransaction: TransactionRunner
  readonly ready: Promise<{ persistent: boolean }>

  constructor() {
    this.ready = init()
    // Same runner as production, so the double cannot drift from it. The ops
    // are synchronous here (no worker), which is the only difference.
    this.runTransaction = createTransactionRunner({
      begin: async () => { db.exec('BEGIN') },
      commit: async () => { db.exec('COMMIT') },
      rollback: async () => { db.exec('ROLLBACK') },
    })
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.ready
    const rows: T[] = []
    db.exec({ sql, bind: params, rowMode: 'object', resultRows: rows })
    return rows
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    await this.ready
    db.exec({ sql, bind: params })
    const lastInsertRowid = db.selectValue('SELECT last_insert_rowid()') as number
    const changes = db.changes() as number
    return { lastInsertRowid, changes }
  }

  async transaction(fn: () => Promise<void>): Promise<void> {
    await this.ready
    return this.runTransaction(fn)
  }

  terminate() {
    if (db) { db.close(); db = null }
  }
}

export const sqliteClient = new TestSqliteClient()
export const dbReady = sqliteClient.ready

export async function __resetForTest() {
  await sqliteClient.ready
  for (const tbl of ALL_TABLES) {
    db.exec(`DELETE FROM "${tbl}"`)
    db.exec(`DELETE FROM sqlite_sequence WHERE name = '${tbl}'`)
  }
}

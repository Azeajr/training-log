/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SCHEMA, ADDITIVE_MIGRATIONS } from './schema'

type InMsg =
  | { id: number; type: 'init' }
  | { id: number; type: 'query'; sql: string; params: unknown[] }
  | { id: number; type: 'run'; sql: string; params: unknown[] }
  | { id: number; type: 'begin' }
  | { id: number; type: 'commit' }
  | { id: number; type: 'rollback' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

function applyAdditiveMigrations() {
  for (const sql of ADDITIVE_MIGRATIONS) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }
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
        applyAdditiveMigrations()
        return { persistent: true }
      } catch {
        if (attempt < 9) await new Promise(r => setTimeout(r, 150))
      }
    }
    console.warn('[sqlite] OPFS SAH pool unavailable after retries, falling back to in-memory')
  }
  db = new sqlite3.oo1.DB()
  db.exec(SCHEMA)
  applyAdditiveMigrations()
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

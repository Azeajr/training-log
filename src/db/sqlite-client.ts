import { createTransactionRunner, type TransactionRunner } from './transaction'

type RunResult = { lastInsertRowid: number; changes: number }

class SqliteClient {
  private worker: Worker
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private nextId = 0
  private runTransaction: TransactionRunner
  readonly ready: Promise<{ persistent: boolean }>


  constructor() {
    this.worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const { id, result, error } = e.data
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      if (error) p.reject(new Error(error))
      else p.resolve(result)
    }
    this.ready = this.send<{ persistent: boolean }>('init', undefined, [])
    this.runTransaction = createTransactionRunner({
      begin: async () => { await this.send('begin', undefined, []) },
      commit: async () => { await this.send('commit', undefined, []) },
      rollback: async () => { await this.send('rollback', undefined, []) },
    })
  }

  private send<T>(type: string, sql: string | undefined, params: unknown[]): Promise<T> {
    const doSend = (): Promise<T> => new Promise((resolve, reject) => {
      const id = this.nextId++
      // init may stall briefly while OPFS pool retries; other ops time out at 10s
      const timer = type === 'init' ? null : setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`SQLite worker timeout: ${type}`))
      }, 10000)
      this.pending.set(id, {
        resolve: (v) => { if (timer) clearTimeout(timer); resolve(v as T) },
        reject:  (e) => { if (timer) clearTimeout(timer); reject(e) },
      })
      this.worker.postMessage({ id, type, sql, params })
    })
    return type !== 'init' ? this.ready.then(doSend) : doSend()
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.send<T[]>('query', sql, params)
  }

  run(sql: string, params: unknown[] = []): Promise<RunResult> {
    return this.send<RunResult>('run', sql, params)
  }

  transaction(fn: () => Promise<void>): Promise<void> {
    return this.runTransaction(fn)
  }

  resetDb(): Promise<void> {
    return this.send('reset', undefined, [])
  }

  terminate() {
    this.worker.terminate()
    for (const { reject } of this.pending.values()) {
      reject(new Error('SQLite worker terminated'))
    }
    this.pending.clear()
  }
}

export const sqliteClient = new SqliteClient()
addEventListener('pagehide', (e) => { if (!(e as PageTransitionEvent).persisted) sqliteClient.terminate() })
export const dbReady = sqliteClient.ready

// Stub for type-checking. The vitest alias replaces this whole module with
// `sqlite-test-client.ts` (which provides a real implementation). Calling
// this in production is a programming error.
export async function __resetForTest(): Promise<void> {
  throw new Error('__resetForTest is only available under vitest')
}

if (import.meta.env.DEV) {
  ;(window as Window & { __e2eResetDb?: () => Promise<void> }).__e2eResetDb = () => sqliteClient.resetDb()
}

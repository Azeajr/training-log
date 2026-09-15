import { createTransactionRunner, type TransactionRunner } from './transaction'
import { createWorkerRpc, type Rpc, type WorkerLike } from './rpc'

type RunResult = { lastInsertRowid: number; changes: number }

class SqliteClient {
  private rpc: Rpc
  private runTransaction: TransactionRunner
  readonly ready: Promise<{ persistent: boolean }>

  constructor() {
    const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
    this.rpc = createWorkerRpc(worker as unknown as WorkerLike)
    this.ready = this.rpc.ready
    this.runTransaction = createTransactionRunner({
      begin: async () => { await this.rpc.send('begin', undefined, []) },
      commit: async () => { await this.rpc.send('commit', undefined, []) },
      rollback: async () => { await this.rpc.send('rollback', undefined, []) },
    })
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.rpc.send<T[]>('query', sql, params)
  }

  run(sql: string, params: unknown[] = []): Promise<RunResult> {
    return this.rpc.send<RunResult>('run', sql, params)
  }

  transaction(fn: () => Promise<void>): Promise<void> {
    return this.runTransaction(fn)
  }

  resetDb(): Promise<void> {
    return this.rpc.send('reset', undefined, [])
  }

  terminate() {
    this.rpc.terminate()
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

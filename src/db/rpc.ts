// Request/response plumbing for the SQLite worker, split out of
// `sqlite-client.ts` so it can be tested: that module builds a real `Worker` at
// import time and vitest aliases it away entirely, so nothing in it was ever
// reachable from a test.
//
// The worker is injected rather than constructed here, so a test can supply one
// that fails to start, never answers, or dies mid-call.

export type RpcResponse = { id: number; result?: unknown; error?: string }

export interface WorkerLike {
  postMessage(msg: unknown): void
  terminate(): void
  onmessage: ((e: { data: RpcResponse }) => void) | null
  onerror: ((e: unknown) => void) | null
  onmessageerror: ((e: unknown) => void) | null
}

export type Rpc = {
  ready: Promise<{ persistent: boolean }>
  send<T>(type: string, sql: string | undefined, params: unknown[]): Promise<T>
  terminate(): void
}

/** A call other than `init` gets this long before it is assumed lost. */
const CALL_TIMEOUT_MS = 10_000
/**
 * `init` is allowed to stall while the OPFS SAH pool retries (up to ten 150ms
 * attempts in the worker), but it is not allowed to stall forever: a worker
 * that 404s, violates CSP or throws while evaluating never answers at all, and
 * without a deadline `ready` simply never settles and the app sits on LOADING.
 */
const INIT_TIMEOUT_MS = 30_000

export function createWorkerRpc(
  worker: WorkerLike,
  opts: { callTimeoutMs?: number; initTimeoutMs?: number } = {},
): Rpc {
  const callTimeoutMs = opts.callTimeoutMs ?? CALL_TIMEOUT_MS
  const initTimeoutMs = opts.initTimeoutMs ?? INIT_TIMEOUT_MS
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let nextId = 0
  // Set once the worker is known to be unusable. Every later call rejects with
  // it rather than queueing against a worker that will never answer.
  let failure: Error | null = null

  /** Tear down every outstanding call, and refuse future ones. */
  const fail = (err: Error) => {
    if (failure) return
    failure = err
    const outstanding = [...pending.values()]
    pending.clear()
    for (const { reject } of outstanding) reject(err)
  }

  worker.onmessage = (e: { data: RpcResponse }) => {
    const { id, result, error } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (error) p.reject(new Error(error))
    else p.resolve(result)
  }

  // A worker that fails to load or dies mid-flight fires these and then goes
  // silent. Without them nothing ever rejects and every caller waits forever.
  worker.onerror = (e: unknown) => {
    fail(new Error(`SQLite worker failed to start: ${describe(e)}`))
  }
  worker.onmessageerror = (e: unknown) => {
    fail(new Error(`SQLite worker sent an unreadable message: ${describe(e)}`))
  }

  const send = <T,>(type: string, sql: string | undefined, params: unknown[]): Promise<T> => {
    const doSend = (): Promise<T> =>
      new Promise((resolve, reject) => {
        if (failure) { reject(failure); return }
        const id = nextId++
        const timeoutMs = type === 'init' ? initTimeoutMs : callTimeoutMs
        const timer = setTimeout(() => {
          if (type === 'init') {
            // Initialization never completing means the worker is unusable, not
            // that one call was slow — fail the whole client. Leave this call in
            // `pending` so `fail` rejects it along with everything else; deleting
            // it first would hide it from the very rejection meant for it.
            if (pending.has(id)) {
              fail(new Error(`SQLite worker timed out after ${timeoutMs}ms during initialization`))
            }
          } else if (pending.delete(id)) {
            reject(new Error(`SQLite worker timeout: ${type}`))
          }
        }, timeoutMs)
        pending.set(id, {
          resolve: (v) => { clearTimeout(timer); resolve(v as T) },
          reject: (e) => { clearTimeout(timer); reject(e) },
        })
        worker.postMessage({ id, type, sql, params })
      })
    // Non-init calls wait for readiness first, but a failed worker must reject
    // rather than hang, so failures short-circuit ahead of that wait.
    if (type === 'init') return doSend()
    if (failure) return Promise.reject(failure)
    return ready.then(doSend)
  }

  const ready = send<{ persistent: boolean }>('init', undefined, [])

  return {
    ready,
    send,
    terminate() {
      worker.terminate()
      fail(new Error('SQLite worker terminated'))
    },
  }
}

/**
 * `worker.onerror` gets an ErrorEvent, and a worker whose script 404s or is
 * blocked by CSP fires one carrying no `message` at all — `String(event)` on
 * that is "[object Event]", which tells a user nothing. Fall back to whatever
 * the event does carry, and to plain words when it carries nothing.
 */
function describe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null) {
    const ev = e as { message?: unknown; filename?: unknown; type?: unknown }
    if (typeof ev.message === 'string' && ev.message) return ev.message
    if (typeof ev.filename === 'string' && ev.filename) return `could not load ${ev.filename}`
    if (typeof ev.type === 'string' && ev.type) {
      return 'the worker script could not be loaded, or threw while starting'
    }
  }
  return String(e)
}

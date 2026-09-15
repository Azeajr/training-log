// The transaction runner, shared by the production client (`sqlite-client.ts`,
// which talks to a worker) and the in-process vitest client
// (`sqlite-test-client.ts`, which drives sqlite-wasm directly).
//
// It lived in both of those, copied, which meant the two could drift and that
// neither was reachable from a test: the production module builds a Worker at
// import time, and vitest aliases it away entirely.
//
// Transactions are SERIALIZED. The previous implementation tracked a depth
// counter and ran a call inline whenever depth > 0, which cannot tell a
// genuinely nested call from an unrelated concurrent one — in a single
// connection those look identical once the outer body has awaited anything.
// Treating a concurrent caller as nested folded it into a transaction it knew
// nothing about, so it was told it had committed and then lost its writes when
// the unrelated transaction rolled back (F05). Losing the counter also loses
// F06, which was that counter getting stuck above zero when BEGIN rejected.
//
// The invariant that makes serializing safe: `transaction()` is the ONLY thing
// that opens a transaction. Nothing nests, so nothing can wait on a lock it is
// already holding. `bulkAdd` used to break this by opening one of its own; it
// no longer does, because atomicity across a group of writes belongs to the
// caller that knows what the group means.
//
// If that invariant is ever broken, the nested call waits for a transaction
// that cannot finish until the nested call returns. `timeoutMs` exists to turn
// that deadlock into a loud error naming the cause, rather than a hang.

export type TxOps = {
  begin: () => Promise<void>
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

export type TransactionRunner = (fn: () => Promise<void>) => Promise<void>

const DEFAULT_TIMEOUT_MS = 15_000

/** Settle when `prev` settles either way; reject if that takes too long. */
function awaitTurn(prev: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(
          `Transaction timed out after ${ms}ms waiting for the previous transaction. ` +
            'This usually means a transaction was opened from inside another one — ' +
            'transactions are serialized, so a nested call waits forever.',
        ),
      )
    }, ms)
    void prev.then(
      () => {},
      () => {},
    ).then(() => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    })
  })
}

export function createTransactionRunner(
  ops: TxOps,
  opts: { timeoutMs?: number } = {},
): TransactionRunner {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Resolves when the transaction at the head of the queue has finished. Each
  // caller waits on its predecessor and publishes its own signal for the next.
  let tail: Promise<void> = Promise.resolve()

  return async function transaction(fn: () => Promise<void>): Promise<void> {
    const prev = tail
    let release!: () => void
    tail = new Promise<void>((r) => { release = r })
    try {
      await awaitTurn(prev, timeoutMs)
      await ops.begin()
      try {
        await fn()
        await ops.commit()
      } catch (err) {
        await ops.rollback()
        throw err
      }
    } finally {
      // Always hand the queue on, including when this caller never got a turn.
      release()
    }
  }
}

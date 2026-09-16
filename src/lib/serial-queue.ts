/**
 * Runs async tasks strictly one after another, in the order they were handed in.
 *
 * Written for the workout screen's set mutations, which share a positional
 * model: `loggedSets[i]` is the set at position `i` of the plan, and a rollback
 * says "remove the last one". That is only true while one mutation is in flight
 * at a time. Overlapping them let a failed earlier save pop a later successful
 * one, and let an undo run against a row whose insert had not returned its id
 * yet — deleting nothing locally and leaving the row behind (F14).
 *
 * Deliberately not a transaction: these are single-row writes that must stay
 * ordered, not atomic. `db/transaction.ts` serializes transactions the same way
 * and for the same reason, but a mutation queued here is free to open one.
 */
export interface SerialQueue {
  /** Queue a task. Resolves (or rejects) with the task's own result. */
  run<T>(task: () => Promise<T>): Promise<T>
  /** Resolves once everything queued *so far* has settled. */
  idle(): Promise<void>
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve()
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task)
      // The chain has to survive a failing task, so the tail swallows the
      // rejection and only the returned promise carries it to the caller.
      tail = result.then(() => undefined, () => undefined)
      return result
    },
    idle: () => tail,
  }
}

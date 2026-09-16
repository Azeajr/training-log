import { createSignal, type Accessor } from 'solid-js'

/**
 * One async read of the database, with an identity and a failure state.
 *
 * Four findings in this pass were the same defect in four places: a screen
 * fires `void load(...)` from an effect, the handler awaits several queries and
 * then writes unkeyed global signals. Two things follow from that shape, and
 * both were live.
 *
 * **Whatever settles last wins.** Select lift A then lift B before A's queries
 * return, and A's rows publish over B's — under B's name. History did this for
 * its lift list, its calendar month and its selected day; `RecordsPanel` did it
 * until F63 gave it a request token, which is the pattern generalised here.
 *
 * **A rejected read escapes into nothing.** `void` discards the rejection, so
 * the screen simply never leaves the state it was in. `/stats` pinned on
 * "Loading…" permanently, with no error text, no retry, and no way back short
 * of navigating away (F23). History was worse than stuck: it reported "No
 * completed sessions yet" over a database full of them, because the empty list
 * it started with is also what an empty log looks like (F21). A screen that
 * cannot read its data must say so rather than describe the data as absent.
 *
 * `run` supersedes any read still in flight — the task is handed `isCurrent()`
 * so it can drop its own result — and always resolves `loading`, on the success
 * path and the failure path alike. `retry` re-runs the most recent task, which
 * is what makes an error state actionable instead of terminal.
 */
export interface AsyncRead {
  /** True from the start of a read until it settles or is superseded. */
  loading: Accessor<boolean>
  /** The message from the most recent failure, or null. */
  error: Accessor<string | null>
  /**
   * Run a read, superseding any still in flight.
   *
   * The task receives `isCurrent`, which goes false as soon as a newer read
   * starts. Check it before publishing anything: results are dropped, not
   * raced. Rejections are caught and surface through `error`.
   */
  run: (task: (isCurrent: () => boolean) => Promise<void>) => Promise<void>
  /** Re-run the most recent task. No-op before the first `run`. */
  retry: () => Promise<void>
}

export function createAsyncRead(): AsyncRead {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  let token = 0
  let last: ((isCurrent: () => boolean) => Promise<void>) | null = null

  const run = async (task: (isCurrent: () => boolean) => Promise<void>): Promise<void> => {
    last = task
    const mine = ++token
    const isCurrent = () => mine === token
    setLoading(true)
    setError(null)
    try {
      await task(isCurrent)
      // A superseded read leaves `loading` alone: the read that superseded it
      // set it true and owns clearing it. Clearing here would flash the newer
      // read's result in before it exists.
      if (isCurrent()) setLoading(false)
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Something went wrong reading your data.')
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    run,
    retry: () => (last ? run(last) : Promise.resolve()),
  }
}

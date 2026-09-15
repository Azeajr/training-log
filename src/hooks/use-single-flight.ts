import { createSignal, type Accessor } from 'solid-js'

/**
 * Runs one async handler at a time and reports whether one is in flight.
 *
 * The post-session modals all write training maxes or advance the cycle, and
 * those writes are not idempotent — a deload is relative (×0.9 of whatever is
 * current), and nothing records that a row came from a deload rather than from
 * the user, so the library cannot tell a second tap from a second cycle. The
 * guard has to be at the control.
 *
 * `busy` is meant to be passed to both the buttons' `disabled` AND to `Modal`'s
 * `busy` prop: Modal owns Escape and "← BACK", so a call site cannot close those
 * paths on its own, and one tap plus one Escape was enough to run two handlers
 * concurrently.
 */
export function useSingleFlight(): {
  busy: Accessor<boolean>
  guard: (run: () => void | Promise<void>) => () => Promise<void>
} {
  const [busy, setBusy] = createSignal(false)
  const guard = (run: () => void | Promise<void>) => async () => {
    if (busy()) return
    setBusy(true)
    try {
      await run()
    } finally {
      setBusy(false)
    }
  }
  return { busy, guard }
}

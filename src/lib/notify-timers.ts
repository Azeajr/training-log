// Tag-keyed one-shot timer registry shared by the page scheduler
// (src/lib/notifications.ts) and the service worker (src/service-worker.ts).
//
// A rest phase can carry several notifications that share a tag (nudge /
// warning / critical), so timers are keyed per-handle with tag grouping:
// `cancelTag` drops every pending timer for a tag, `arm` never evicts
// same-tag timers. `tag` is also the notification coalescing key, so a fired
// notification replaces an earlier same-tag one instead of stacking.
//
// Engine caveat (see COMMON_MISTAKES #11): in a service worker, `setTimeout`
// does NOT keep the worker alive — the browser may terminate an idle worker
// (~30 s on Chrome) and kill every pending timer. Callers that need
// reliability must run a page-side instance; the SW instance is best-effort.

export interface NotifyTarget {
  readonly fireAt: number   // absolute timestamp (ms)
  readonly title: string
  readonly body: string
  readonly tag: string
}

export type TimerHandle = number

interface Pending {
  target: NotifyTarget
  timer: ReturnType<typeof setTimeout> | null
  // Guards fireNow against races: a past-due target fires on a deferred tick,
  // and cancelTag/cancelHandle between arm and that tick must suppress it.
  fired: boolean
}

export interface NotifyTimersDeps {
  /** Defaults to Date.now; injectable for tests. */
  now?: () => number
  fire: (target: NotifyTarget, handle: TimerHandle) => void
}

export interface NotifyTimers {
  arm(target: NotifyTarget): TimerHandle
  cancelTag(tag: string): void
  cancelHandle(handle: TimerHandle): void
  cancelAll(): void
  /** Live handles, arm order — for debugging and tests. */
  pending(): Array<{ handle: TimerHandle; target: NotifyTarget }>
}

export function createNotifyTimers(deps: NotifyTimersDeps): NotifyTimers {
  // Bound at call time so injected/patched clocks (vi.useFakeTimers) win.
  const now = (): number => (deps.now ?? Date.now)()
  const byHandle = new Map<TimerHandle, Pending>()
  const byTag = new Map<string, Set<TimerHandle>>()
  let seq = 0

  const release = (handle: TimerHandle) => {
    const pending = byHandle.get(handle)
    if (!pending) return
    byHandle.delete(handle)
    const tagHandles = byTag.get(pending.target.tag)
    tagHandles?.delete(handle)
    if (tagHandles && tagHandles.size === 0) byTag.delete(pending.target.tag)
  }

  const cancelHandle = (handle: TimerHandle): void => {
    const pending = byHandle.get(handle)
    if (!pending || pending.fired) return
    pending.fired = true
    if (pending.timer) clearTimeout(pending.timer)
    release(handle)
  }

  return {
    arm(target: NotifyTarget): TimerHandle {
      const handle = ++seq
      const pending: Pending = { target, timer: null, fired: false }
      byHandle.set(handle, pending)
      let tagHandles = byTag.get(target.tag)
      if (!tagHandles) {
        tagHandles = new Set()
        byTag.set(target.tag, tagHandles)
      }
      tagHandles.add(handle)

      const fireNow = () => {
        if (pending.fired) return
        pending.fired = true
        release(handle)
        deps.fire(target, handle)
      }

      const delay = target.fireAt - now()
      // Past-due targets fire on a deferred tick so a re-schedule's
      // cancel-then-arm sequence can drop stale targets without them popping.
      pending.timer = setTimeout(fireNow, delay <= 0 ? 0 : delay)
      return handle
    },

    cancelTag(tag: string): void {
      const tagHandles = byTag.get(tag)
      if (!tagHandles) return
      for (const handle of [...tagHandles]) cancelHandle(handle)
    },

    cancelHandle,

    cancelAll(): void {
      for (const handle of [...byHandle.keys()]) cancelHandle(handle)
    },

    pending(): Array<{ handle: TimerHandle; target: NotifyTarget }> {
      return [...byHandle.entries()]
        .map(([handle, p]) => ({ handle, target: p.target }))
        .sort((a, b) => a.handle - b.handle)
    },
  }
}
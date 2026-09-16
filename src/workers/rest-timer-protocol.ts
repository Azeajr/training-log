// The rest-timer protocol, separated from the Worker entry point that hosts it.
//
// `test-setup.ts` used to re-implement this as a MockWorker, and that stub was
// the ONLY implementation any test exercised — `timer.worker.ts` has no test
// file, so neither was ever checked against the other. They had diverged:
//
//   pause    the stub cleared its interval; the real worker keeps the interval
//            running and gates posting on a flag
//   start    without restStartedAt the stub fell back to Date.now() and ticked;
//            the real worker leaves it null and its guard blocks every post —
//            opposite behaviour from the same message
//
// Worse, the stub blocked its own fix: F68 wants an immediate post on `resume`,
// and a test written against that fix would still fail under a stub that does
// not have it. One implementation, shared, so that cannot happen again.
//
// Message delivery stays the caller's business: the worker posts through
// `self.postMessage`, the test stub calls `onmessage` directly.

export type RestTimerMessage =
  | { type: 'start'; restStartedAt: number }
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }

export type RestTimerTick = { elapsed: number }

export interface RestTimer {
  handle(msg: RestTimerMessage): void
  terminate(): void
}

export function createRestTimer(post: (tick: RestTimerTick) => void): RestTimer {
  let intervalId: ReturnType<typeof setInterval> | null = null
  let restStartedAt: number | null = null
  let paused = false

  const startTicking = () => {
    if (intervalId) clearInterval(intervalId)
    intervalId = setInterval(() => {
      if (restStartedAt != null && !paused) {
        post({ elapsed: Math.floor((Date.now() - restStartedAt) / 1000) })
      }
    }, 1000)
  }

  return {
    handle(msg) {
      switch (msg.type) {
        case 'start':
          restStartedAt = msg.restStartedAt
          paused = false
          startTicking()
          break
        case 'stop':
          if (intervalId) { clearInterval(intervalId); intervalId = null }
          restStartedAt = null
          break
        case 'pause':
          paused = true
          break
        case 'resume':
          // Post at once, and restart the interval so its phase resets. This
          // only cleared the flag, and the 1 Hz interval kept its original
          // phase — so the first `elapsed` after the tab became visible arrived
          // up to a full second late, while the countdown on screen had already
          // jumped to the true value. The timer visibly disagreed with itself
          // for that second (F68).
          paused = false
          if (restStartedAt != null) {
            post({ elapsed: Math.floor((Date.now() - restStartedAt) / 1000) })
            startTicking()
          }
          break
      }
    },
    terminate() {
      if (intervalId) { clearInterval(intervalId); intervalId = null }
    },
  }
}

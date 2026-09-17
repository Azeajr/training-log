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
  // Diagnostics only (src/lib/trace.ts). A Worker has no localStorage, so it
  // cannot record anything itself; the page turns this on and the worker
  // answers with heartbeats the page writes down on its behalf.
  | { type: 'trace'; on: boolean }

/**
 * A countdown tick.
 *
 * `at` and `seq` are the worker's OWN clock and counter, and they are what make
 * the page/worker split observable: compared against the page's receipt time,
 * a burst of ticks carrying old `at` values means the PAGE was frozen while the
 * worker ran, while numbers missing from `seq` mean the WORKER itself lost
 * time. Neither is visible from `elapsed` alone, which is derived from
 * `Date.now()` at read time and therefore always looks correct.
 */
export type RestTimerTick = { elapsed: number; at: number; seq: number }

/**
 * Liveness only — emitted while tracing is on, including while PAUSED, which
 * ticks deliberately are not (RestTimer pauses the worker whenever the page
 * hides). Without a beat that outlives the pause, a hidden page's silence is
 * ambiguous between "paused as designed" and "the worker is gone", and that
 * ambiguity is the open question.
 */
export type RestTimerBeat = {
  hb: true
  at: number
  seq: number
  paused: boolean
  /** Whether a rest is armed at all — `restStartedAt != null`. */
  armed: boolean
}

export interface RestTimer {
  handle(msg: RestTimerMessage): void
  terminate(): void
}

/**
 * `beat` is the diagnostics channel and is optional on purpose: the app path
 * cannot be broken by the probe path if the probe is a separate callback the
 * app never has to supply.
 */
export function createRestTimer(
  post: (tick: RestTimerTick) => void,
  beat?: (b: RestTimerBeat) => void,
): RestTimer {
  let intervalId: ReturnType<typeof setInterval> | null = null
  let restStartedAt: number | null = null
  let paused = false
  let tracing = false
  // Shared by ticks and beats, so a gap in the sequence is detectable across
  // both: a missing number is time the worker did not run.
  let seq = 0

  const emit = () => {
    const at = Date.now()
    const startedAt = restStartedAt
    if (startedAt != null && !paused) {
      // A tick already proves this interval ran: it carries `at` and `seq`.
      post({ elapsed: Math.floor((at - startedAt) / 1000), at, seq: seq++ })
      return
    }
    // A SUPPRESSED tick is the ambiguous case — paused, or armed with no start
    // — so that is where a beat earns its keep.
    if (tracing) beat?.({ hb: true, at, seq: seq++, paused, armed: startedAt != null })
  }

  const startTicking = () => {
    if (intervalId) clearInterval(intervalId)
    intervalId = setInterval(emit, 1000)
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
            const at = Date.now()
            post({ elapsed: Math.floor((at - restStartedAt) / 1000), at, seq: seq++ })
            startTicking()
          }
          break
        case 'trace':
          tracing = msg.on
          break
      }
    },
    terminate() {
      if (intervalId) { clearInterval(intervalId); intervalId = null }
    },
  }
}

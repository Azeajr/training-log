import { createSignal, createEffect, on, onCleanup, Show } from 'solid-js'
import { workout, stopRest } from '../../store/workout-store'
import { settings } from '../../store/settings-store'
import {
  formatDuration, restStatus, restTarget, restThresholds,
  REST_TYPE_LABEL, type RestPhase, type RestThresholds,
} from '../../lib/calc'
import { playCue, unlockAudio, ensureAudioCtx } from '../../lib/audio-cues'
import { getTimerWorker } from '../../lib/rest-timer-worker'
import { trace, isTraceEnabled } from '../../lib/trace'
import { startKeepalive, stopKeepalive } from '../../lib/keepalive'
import type { RestTimerTick, RestTimerBeat } from '../../workers/rest-timer-protocol'
import {
  scheduleRest,
  cancelRest,
  scheduleStalledSession,
  cancelStalled,
  cancelAll,
} from '../../lib/notifications'

// Seconds one tap of the extend button buys.
const BONUS_STEP = 30

export default function RestTimer() {
  const [elapsed, setElapsed] = createSignal(0)
  // Time added to *this* rest by the extend button. Reset whenever a new rest
  // starts, so it never leaks into the next set.
  const [bonus, setBonus] = createSignal(0)
  let prevElapsed = -1
  let wakeLock: WakeLockSentinel | null = null

  // One sentinel, one owner. Two effects request on a single rest start and one
  // async function cleared them, so sentinels were dropped without being
  // released: the second request overwrote the first, and a release that nulled
  // the variable only AFTER its own await clobbered anything assigned meanwhile
  // (which is what tapping +30s produces, since the scheduling effect re-runs).
  // The screen then stayed awake after the session ended, on a phone, for as
  // long as the page lived.
  //
  // `pending` makes a concurrent caller await the in-flight request rather than
  // start a second one; the release nulls both BEFORE awaiting, so a request
  // that lands during a release cannot be stranded.
  let pending: Promise<void> | null = null

  const requestWakeLock = async (): Promise<void> => {
    if (!('wakeLock' in navigator)) return
    // `released` is set by the browser when it drops the lock on its own.
    if (wakeLock !== null && wakeLock.released !== true) return
    wakeLock = null
    if (pending) return pending
    pending = (async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        // Released while this was in flight: let it go rather than hold a
        // sentinel nothing will ever release.
        if (pending === null) await sentinel.release().catch(() => {})
        else wakeLock = sentinel
      } catch {
        // denied or not supported
      } finally {
        pending = null
      }
    })()
    return pending
  }

  const releaseWakeLock = async (): Promise<void> => {
    const held = wakeLock
    wakeLock = null
    pending = null
    if (held !== null) await held.release().catch(() => {})
  }

  document.addEventListener('touchstart', unlockAudio, { passive: true })
  onCleanup(() => document.removeEventListener('touchstart', unlockAudio))

  const [isVisible, setIsVisible] = createSignal(!document.hidden)
  const visibilityHandler = () => {
    trace('page.visibility', { hidden: document.hidden, elapsed: elapsed() })
    setIsVisible(!document.hidden)
  }
  document.addEventListener('visibilitychange', visibilityHandler)
  onCleanup(() => document.removeEventListener('visibilitychange', visibilityHandler))

  // The user's configured lengths, shifted by whatever this rest has been
  // extended by. Everything downstream — the countdown, the audio cue phases and
  // the scheduled notifications — reads this one set, so they cannot disagree.
  const activeThresholds = (): RestThresholds => {
    const base = restThresholds(settings)
    const b = bonus()
    if (b === 0) return base
    return {
      firstBell: base.firstBell + b,
      secondBell: base.secondBell + b,
      failedBell: base.failedBell + b,
    }
  }

  const target = () => restTarget(workout.restType, activeThresholds())
  const remaining = () => target() - elapsed()
  const progress = () => {
    const t = target()
    return t > 0 ? Math.min(1, elapsed() / t) : 1
  }

  // A fresh rest always starts unextended. Keyed on restStartedAt alone so the
  // reset can't fight the scheduling effect below, which reads the bonus.
  createEffect(on(() => workout.restStartedAt, () => setBonus(0)))

  createEffect(() => {
    const isResting = workout.isResting
    const restStartedAt = workout.restStartedAt
    const notify = settings.restTimerNotifications
    const t = activeThresholds()
    if (!isResting || restStartedAt == null) {
      prevElapsed = -1
      if (notify) cancelRest()
      getTimerWorker().postMessage({ type: 'stop' })
      return
    }
    const worker = getTimerWorker()
    worker.onmessage = (e: MessageEvent<RestTimerTick | RestTimerBeat>) => {
      const data = e.data
      // `lag` is the measurement: the worker stamps `at` when it emits, so a
      // large lag means the PAGE was not running when the message arrived.
      // `elapsed` alone cannot show that — it is computed from `Date.now()` at
      // emit time, so it looks correct no matter how late it is read.
      const lag = Date.now() - data.at
      if ('hb' in data) {
        trace('worker.beat', { seq: data.seq, at: data.at, lag, paused: data.paused }, 'worker')
        return
      }
      trace('worker.tick', { seq: data.seq, at: data.at, lag, elapsed: data.elapsed }, 'worker')
      setElapsed(data.elapsed)
    }
    worker.postMessage({ type: 'trace', on: isTraceEnabled() })
    worker.postMessage({ type: 'start', restStartedAt })
    trace('rest.start', {
      restStartedAt, type: workout.restType, thresholds: t,
      hidden: document.hidden, notify,
    })
    if (notify) scheduleRest(restStartedAt, workout.restType, t)
    void requestWakeLock()
    ensureAudioCtx()
    // Experiment (off by default): hold the process across an app switch for
    // the duration of this rest only, so the cost is bounded to when a bell is
    // actually pending.
    startKeepalive()
    // The page's own liveness, independent of message delivery. Worker beats
    // arriving in a burst while these show a hole is the signature of a frozen
    // page; both stopping together is the signature of a dead process. Only
    // created while tracing, so normal use carries no extra timer.
    if (isTraceEnabled()) {
      const beat = setInterval(
        () => trace('page.beat', { elapsed: elapsed(), hidden: document.hidden }),
        1000,
      )
      onCleanup(() => clearInterval(beat))
    }
    onCleanup(() => {
      trace('rest.end', { elapsed: elapsed() })
      worker.postMessage({ type: 'stop' })
      stopKeepalive()
      void releaseWakeLock()
    })
  })

  createEffect(() => {
    if (!workout.isResting) return
    getTimerWorker().postMessage({ type: isVisible() ? 'resume' : 'pause' })
    // Symmetric on purpose. A hidden page does not need the screen kept awake,
    // and the browser releases the sentinel itself when the page hides — so
    // holding our reference past that point means believing we still own a lock
    // we do not, and never re-requesting on the way back.
    if (isVisible()) void requestWakeLock()
    else void releaseWakeLock()
  })

  createEffect(() => {
    const session = workout.activeSession
    if (!session || !settings.restTimerNotifications) {
      cancelStalled()
      return
    }
    scheduleStalledSession(new Date(session.date).getTime())
  })

  onCleanup(() => cancelAll())

  // Each checkpoint is one equal bell. The phase still drives the distinct
  // on-screen copy, but it no longer implies escalating multi-pulse alarms.
  const phaseToCue: Record<RestPhase, 'nudge' | null> = {
    idle: null, nudge: 'nudge', warning: 'nudge', critical: 'nudge',
  }

  createEffect(() => {
    const e = elapsed()
    const type = workout.restType
    const t = activeThresholds()
    if (!workout.isResting || e === 0) return
    const prev = prevElapsed
    prevElapsed = e
    if (prev < 0) return
    const prevPhase = restStatus(prev, type, t).phase
    const currPhase = restStatus(e, type, t).phase
    if (prevPhase !== currPhase) {
      const cue = phaseToCue[currPhase]
      trace('cue.phase', { prev: prevPhase, curr: currPhase, elapsed: e, cue, hidden: document.hidden })
      if (cue) playCue(cue)
    }
  })

  const status = () => restStatus(elapsed(), workout.restType, activeThresholds())
  const overrun = () => remaining() < 0

  return (
    <Show when={workout.isResting}>
      <div class="fixed bottom-[var(--nav-h)] left-0 right-0 bg-bg border-t-2 border-border px-4 py-3">
        <div class="max-w-3xl mx-auto">
          <div class="flex items-end justify-between gap-4">
            <div class="min-w-0">
              {/* The countdown targets the first completed-set bell or the
                  single failed-set bell; the label makes that distinction. */}
              <div class="text-muted text-xs uppercase tracking-widest mb-1">
                {REST_TYPE_LABEL[workout.restType]}
              </div>
              <div class="flex items-baseline gap-2">
                <div
                  class={`font-mono text-4xl leading-none ${overrun() ? 'text-danger' : 'text-warn'}`}
                  data-testid="rest-timer-display"
                >
                  {overrun() ? `+${formatDuration(-remaining())}` : formatDuration(remaining())}
                </div>
                <div class="text-faint text-xs tracking-widest whitespace-nowrap">
                  {overrun() ? 'OVER' : `LEFT OF ${formatDuration(target())}`}
                </div>
              </div>
            </div>
            <div class="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  trace('rest.extend', { by: BONUS_STEP, elapsed: elapsed() })
                  setBonus(b => b + BONUS_STEP)
                }}
                aria-label="Add 30 seconds to this rest"
                class="border border-border px-3 py-3 font-mono text-text-dim text-xs tracking-widest hover:border-accent hover:text-accent"
              >
                +30s
              </button>
              <button
                onClick={() => { trace('rest.skip', { elapsed: elapsed() }); stopRest() }}
                aria-label="SKIP REST"
                class="border border-border px-5 py-3 font-mono text-text-dim text-xs tracking-widest hover:border-accent hover:text-accent"
              >
                SKIP
              </button>
            </div>
          </div>
          {/* One depleting rule. Cheaper to read at arm's length than digits. */}
          <div class="h-0.5 bg-border-dim mt-3">
            <div
              class={`h-full ${overrun() ? 'bg-danger' : 'bg-warn'}`}
              style={{ width: `${progress() * 100}%` }}
            />
          </div>
          <Show when={status().message}>
            <div class="text-warn text-xs uppercase tracking-widest mt-2">{status().message}</div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

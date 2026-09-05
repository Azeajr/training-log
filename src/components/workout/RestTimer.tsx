import { createSignal, createEffect, on, onCleanup, Show } from 'solid-js'
import { workout, stopRest } from '../../store/workout-store'
import { settings } from '../../store/settings-store'
import {
  formatDuration, restStatus, restTarget, restThresholds,
  REST_TYPE_LABEL, type RestPhase, type RestThresholds,
} from '../../lib/calc'
import { playCue, unlockAudio, ensureAudioCtx } from '../../lib/audio-cues'
import { getTimerWorker } from '../../lib/rest-timer-worker'
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

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
    } catch {
      // denied or not supported
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLock !== null) {
      await wakeLock.release()
      wakeLock = null
    }
  }

  document.addEventListener('touchstart', unlockAudio, { passive: true })
  onCleanup(() => document.removeEventListener('touchstart', unlockAudio))

  const [isVisible, setIsVisible] = createSignal(!document.hidden)
  const visibilityHandler = () => setIsVisible(!document.hidden)
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
      normal: base.normal + b,
      transition: base.transition + b,
      failNudge: base.failNudge + b,
      failMax: base.failMax + b,
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
    worker.onmessage = (e: MessageEvent<{ elapsed: number }>) => setElapsed(e.data.elapsed)
    worker.postMessage({ type: 'start', restStartedAt })
    if (notify) scheduleRest(restStartedAt, workout.restType, t)
    void requestWakeLock()
    ensureAudioCtx()
    onCleanup(() => {
      worker.postMessage({ type: 'stop' })
      void releaseWakeLock()
    })
  })

  createEffect(() => {
    if (!workout.isResting) return
    getTimerWorker().postMessage({ type: isVisible() ? 'resume' : 'pause' })
    if (isVisible()) void requestWakeLock()
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

  const phaseToCue: Record<RestPhase, 'nudge' | 'warning' | 'critical' | null> = {
    idle: null, nudge: 'nudge', warning: 'warning', critical: 'critical',
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
              {/* The three rest lengths differ by set context, and the context
                  was never named — which made them read as arbitrary. */}
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
                onClick={() => setBonus(b => b + BONUS_STEP)}
                aria-label="Add 30 seconds to this rest"
                class="border border-border px-3 py-3 font-mono text-text-dim text-xs tracking-widest hover:border-accent hover:text-accent"
              >
                +30s
              </button>
              <button
                onClick={stopRest}
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

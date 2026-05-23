import { createSignal, createEffect, onCleanup, Show } from 'solid-js'
import { workout, stopRest } from '../../store/workout-store'
import { formatDuration, restStatus, type RestPhase } from '../../lib/calc'
import { playCue, unlockAudio, ensureAudioCtx } from '../../lib/audio-cues'
import { getTimerWorker } from '../../lib/rest-timer-worker'

export default function RestTimer() {
  const [elapsed, setElapsed] = createSignal(0)
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

  createEffect(() => {
    const isResting = workout.isResting
    const restStartedAt = workout.restStartedAt
    if (!isResting || restStartedAt == null) {
      prevElapsed = -1
      getTimerWorker().postMessage({ type: 'stop' })
      return
    }
    const worker = getTimerWorker()
    worker.onmessage = (e: MessageEvent<{ elapsed: number }>) => setElapsed(e.data.elapsed)
    worker.postMessage({ type: 'start', restStartedAt })
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

  const phaseToCue: Record<RestPhase, 'nudge' | 'warning' | 'critical' | null> = {
    idle: null, nudge: 'nudge', warning: 'warning', critical: 'critical',
  }

  createEffect(() => {
    const e = elapsed()
    const type = workout.restType
    if (!workout.isResting || e === 0) return
    const prev = prevElapsed
    prevElapsed = e
    if (prev < 0) return
    const prevPhase = restStatus(prev, type).phase
    const currPhase = restStatus(e, type).phase
    if (prevPhase !== currPhase) {
      const cue = phaseToCue[currPhase]
      if (cue) playCue(cue)
    }
  })

  const status = () => restStatus(elapsed(), workout.restType)

  return (
    <Show when={workout.isResting}>
      <div class="fixed bottom-16 left-0 right-0 bg-bg border-t-2 border-border px-4 py-4">
        <div class="max-w-3xl mx-auto flex items-center justify-between gap-6">
          <div>
            <div class="text-muted text-xs uppercase tracking-widest mb-1">REST</div>
            <div class="text-warn font-mono text-4xl leading-none" data-testid="rest-timer-display">{formatDuration(elapsed())}</div>
            <Show when={status().message}>
              <div class="text-warn text-xs uppercase tracking-widest mt-2">{status().message}</div>
            </Show>
          </div>
          <button
            onClick={stopRest}
            class="border border-border px-6 py-4 font-mono text-text-dim text-xs tracking-widest hover:border-accent hover:text-accent shrink-0"
          >
            SKIP REST
          </button>
        </div>
      </div>
    </Show>
  )
}

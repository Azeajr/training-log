import { createSignal, createEffect, onCleanup, Show } from 'solid-js'
import { workout, stopRest } from '../../store/workout-store'
import { formatDuration, restStatus, type RestPhase } from '../../lib/calc'

// audioCtx and timerWorker are intentionally module-scoped: AudioContext can only be unlocked by a
// user gesture, so we keep one instance across mounts. The rest-timer worker is cheap to keep alive.
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

async function playTone(freq: number, duration: number, startDelay = 0) {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + startDelay
    gain.gain.setValueAtTime(0.25, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  } catch {
    // audio not available
  }
}

function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

function playCue(level: 'nudge' | 'warning' | 'critical') {
  if (level === 'nudge') {
    playTone(880, 0.15)
    vibrate(80)
  } else if (level === 'warning') {
    playTone(880, 0.15)
    playTone(880, 0.15, 0.25)
    vibrate([80, 40, 80])
  } else {
    playTone(660, 0.2)
    playTone(660, 0.2, 0.3)
    playTone(660, 0.2, 0.6)
    vibrate([120, 60, 120, 60, 120])
  }
}

let timerWorker: Worker | null = null
function getTimerWorker(): Worker {
  if (!timerWorker) {
    timerWorker = new Worker(new URL('../../workers/timer.worker.ts', import.meta.url), { type: 'module' })
  }
  return timerWorker
}

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

  // iOS requires AudioContext.resume() inside a direct synchronous touch handler.
  // Attach here (not module-level) so cleanup happens on unmount.
  const touchUnlock = () => {
    if (audioCtx?.state === 'running') return
    try { void getAudioCtx().resume() } catch { /* ignore */ }
  }
  document.addEventListener('touchstart', touchUnlock, { passive: true })
  onCleanup(() => document.removeEventListener('touchstart', touchUnlock))

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
    try { getAudioCtx() } catch { /* ignore if browser blocks before gesture */ }
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
            <div class="text-warn font-mono text-4xl leading-none">{formatDuration(elapsed())}</div>
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

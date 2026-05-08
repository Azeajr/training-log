import { createSignal, createEffect, onCleanup, Show } from 'solid-js'
import { workout, stopRest } from '../store/workoutStore'
import { formatDuration } from '../../src/lib/calc'

const NORMAL_THRESHOLD = 90
const TRANSITION_THRESHOLD = 60
const FAIL_NUDGE = 180
const FAIL_MAX = 300

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playTone(freq: number, duration: number, startDelay = 0) {
  try {
    const ctx = getAudioCtx()
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
    timerWorker = new Worker(new URL('../../src/workers/timer.worker.ts', import.meta.url), { type: 'module' })
  }
  return timerWorker
}

export default function RestTimer() {
  const [elapsed, setElapsed] = createSignal(0)
  let prevElapsed = -1

  // Page visibility
  const [isVisible, setIsVisible] = createSignal(!document.hidden)
  const visibilityHandler = () => setIsVisible(!document.hidden)
  document.addEventListener('visibilitychange', visibilityHandler)
  onCleanup(() => document.removeEventListener('visibilitychange', visibilityHandler))

  // Start/stop timer worker
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
    onCleanup(() => { worker.postMessage({ type: 'stop' }) })
  })

  // Pause/resume on visibility change
  createEffect(() => {
    if (!workout.isResting) return
    getTimerWorker().postMessage({ type: isVisible() ? 'resume' : 'pause' })
  })

  // Audio/vibration cues
  createEffect(() => {
    const e = elapsed()
    const type = workout.restType
    if (!workout.isResting || e === 0) return
    const prev = prevElapsed
    prevElapsed = e

    if (type === 'fail') {
      if (prev < FAIL_MAX && e >= FAIL_MAX) playCue('critical')
      else if (prev < FAIL_NUDGE && e >= FAIL_NUDGE) playCue('warning')
    } else if (type === 'transition') {
      if (prev < TRANSITION_THRESHOLD && e >= TRANSITION_THRESHOLD) playCue('nudge')
    } else {
      if (prev < NORMAL_THRESHOLD && e >= NORMAL_THRESHOLD) playCue('nudge')
    }
  })

  const message = () => {
    const e = elapsed()
    const type = workout.restType
    if (type === 'fail') {
      if (e >= FAIL_MAX) return 'REST UP — SET FAILED'
      if (e >= FAIL_NUDGE) return 'TIME FOR YOUR NEXT SET'
    } else if (type === 'transition') {
      if (e >= TRANSITION_THRESHOLD) return 'TIME FOR YOUR NEXT SET'
    } else {
      if (e >= NORMAL_THRESHOLD) return 'TIME FOR YOUR NEXT SET'
    }
    return ''
  }

  return (
    <Show when={workout.isResting}>
      <div class="fixed bottom-16 left-0 right-0 bg-bg border-t-2 border-border px-4 py-4">
        <div class="max-w-3xl mx-auto flex items-center justify-between gap-6">
          <div>
            <div class="text-muted text-xs uppercase tracking-widest mb-1">REST</div>
            <div class="text-warn font-mono text-4xl leading-none">{formatDuration(elapsed())}</div>
            <Show when={message()}>
              <div class="text-warn text-xs uppercase tracking-widest mt-2">{message()}</div>
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

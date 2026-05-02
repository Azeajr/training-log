import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import { formatDuration } from '../lib/calc'

const NORMAL_THRESHOLD = 90
const TRANSITION_THRESHOLD = 60
const FAIL_NUDGE = 180
const FAIL_MAX = 300

// Module-level AudioContext reused across renders
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
    // audio not available in this context
  }
}

function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

// Three escalating cue levels
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

export default function RestTimer() {
  const { isResting, restStartedAt, restType, stopRest } = useWorkoutStore()
  const [elapsed, setElapsed] = useState(0)
  const prevElapsed = useRef(-1)

  useEffect(() => {
    if (!isResting || restStartedAt == null) {
      prevElapsed.current = -1
      return
    }
    const tick = () => setElapsed(Math.floor((Date.now() - restStartedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isResting, restStartedAt])

  // Fire audio + vibration exactly once when crossing each threshold
  useEffect(() => {
    if (!isResting || elapsed === 0) return
    const prev = prevElapsed.current
    prevElapsed.current = elapsed

    if (restType === 'fail') {
      if (prev < FAIL_MAX && elapsed >= FAIL_MAX) playCue('critical')
      else if (prev < FAIL_NUDGE && elapsed >= FAIL_NUDGE) playCue('warning')
    } else if (restType === 'transition') {
      if (prev < TRANSITION_THRESHOLD && elapsed >= TRANSITION_THRESHOLD) playCue('nudge')
    } else {
      if (prev < NORMAL_THRESHOLD && elapsed >= NORMAL_THRESHOLD) playCue('nudge')
    }
  }, [elapsed, restType, isResting])

  if (!isResting) return null

  let message = ''
  if (restType === 'fail') {
    if (elapsed >= FAIL_MAX) message = 'REST UP — SET FAILED'
    else if (elapsed >= FAIL_NUDGE) message = 'TIME FOR YOUR NEXT SET'
  } else if (restType === 'transition') {
    if (elapsed >= TRANSITION_THRESHOLD) message = 'TIME FOR YOUR NEXT SET'
  } else {
    if (elapsed >= NORMAL_THRESHOLD) message = 'TIME FOR YOUR NEXT SET'
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 bg-bg border-t-2 border-border px-4 py-4">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-6">
        <div>
          <div className="text-muted text-xs uppercase tracking-widest mb-1">REST</div>
          <div className="text-warn font-mono text-4xl leading-none">{formatDuration(elapsed)}</div>
          {message && (
            <div className="text-warn text-xs uppercase tracking-widest mt-2">{message}</div>
          )}
        </div>
        <button
          onClick={stopRest}
          className="border border-border px-6 py-4 font-mono text-text-dim text-xs tracking-widest hover:border-accent hover:text-accent shrink-0"
        >
          SKIP REST
        </button>
      </div>
    </div>
  )
}

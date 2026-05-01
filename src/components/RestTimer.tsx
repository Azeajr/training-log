import { useEffect, useState } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatDuration } from '../lib/calc'

export default function RestTimer() {
  const { isResting, restStartedAt, lastAmrapFailed, stopRest } = useWorkoutStore()
  const { restTimer1, restTimer2, restTimerFail } = useSettingsStore()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isResting || restStartedAt == null) return
    const tick = () => setElapsed(Math.floor((Date.now() - restStartedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isResting, restStartedAt])

  if (!isResting) return null

  let message = ''
  if (lastAmrapFailed && elapsed >= restTimerFail) {
    message = 'REST UP — SET FAILED'
  } else if (elapsed >= restTimer2) {
    message = 'DO YOUR NEXT SET NOW'
  } else if (elapsed >= restTimer1) {
    message = 'TIME FOR YOUR NEXT SET'
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 bg-zinc-900 border-t border-zinc-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-zinc-500 text-xs uppercase tracking-widest">REST </span>
          <span className="text-amber-400 font-mono text-lg">{formatDuration(elapsed)}</span>
          {message && (
            <div className="text-amber-400 text-xs uppercase tracking-widest mt-1">{message}</div>
          )}
        </div>
        <button
          onClick={stopRest}
          className="border border-zinc-700 px-3 py-1 font-mono text-zinc-500 text-xs hover:border-green-400 hover:text-green-400"
        >
          SKIP REST
        </button>
      </div>
    </div>
  )
}

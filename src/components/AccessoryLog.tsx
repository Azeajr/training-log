import { useState } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import type { AccessorySet, Exercise } from '../db/db'
import DurationInput from './DurationInput'

interface ActiveAccessory {
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Partial<AccessorySet>[]
}

interface Props {
  accessory: ActiveAccessory
  exercise: Exercise | undefined
}

export default function AccessoryLog({ accessory, exercise }: Props) {
  const { logAccessorySet, startRest } = useWorkoutStore()
  const [reps, setReps] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [distance, setDistance] = useState('')
  const type = exercise?.type ?? 'reps'
  const nextSet = accessory.loggedSets.length + 1

  const handleLog = () => {
    const set: Partial<AccessorySet> = {
      exerciseId: accessory.exerciseId,
      setNumber: nextSet,
      weight: accessory.calculatedWeight,
      reps: type === 'reps' ? (parseInt(reps) || 0) : null,
      duration: type === 'timed' ? duration : null,
      distance: type === 'distance' ? (parseFloat(distance) || null) : null,
    }
    logAccessorySet(accessory.exerciseId, set)
    // last set of this exercise → transition to next; otherwise same exercise → normal
    startRest(nextSet >= 5 ? 'transition' : 'normal')
    setReps('')
    setDuration(null)
    setDistance('')
  }

  const done = accessory.loggedSets.length >= 5

  return (
    <div className="border border-zinc-700 p-3 mb-3">
      <div className="text-zinc-100 text-sm mb-1 uppercase tracking-widest">
        {accessory.exerciseName}
        <span className="text-zinc-500 ml-2 text-xs">5x10 @ {accessory.calculatedWeight}lb</span>
      </div>
      {accessory.loggedSets.map((s, i) => (
        <div key={i} className="text-zinc-500 text-xs pl-2 py-0.5">
          Set {i + 1}:
          {s.reps != null && <> {s.reps} reps</>}
          {s.duration != null && <> {s.duration}s</>}
          {s.distance != null && <> {s.distance}ft</>}
          <span className="text-green-400 ml-2">done</span>
        </div>
      ))}
      {!done && (
        <div className="flex items-center gap-2 mt-2 pl-2">
          <span className="text-amber-400 text-xs">Set {nextSet}:</span>
          {type === 'reps' && (
            <input
              type="number"
              min={0}
              value={reps}
              onChange={e => setReps(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-2 py-1 w-16 text-center focus:outline-none focus:border-green-400"
              placeholder="10"
            />
          )}
          {type === 'timed' && (
            <DurationInput value={duration} onChange={setDuration} />
          )}
          {type === 'distance' && (
            <input
              type="number"
              min={0}
              value={distance}
              onChange={e => setDistance(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-2 py-1 w-20 text-center focus:outline-none focus:border-green-400"
              placeholder="0"
            />
          )}
          <button
            onClick={handleLog}
            className="border border-green-400 text-green-400 px-3 py-1 font-mono text-xs"
          >
            LOG
          </button>
        </div>
      )}
    </div>
  )
}

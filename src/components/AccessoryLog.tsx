import { useState } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import type { AccessorySet, Exercise } from '../db/db'
import DurationInput from './DurationInput'
import Stepper from './Stepper'

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
  const [reps, setReps] = useState(10)
  const [duration, setDuration] = useState<number | null>(null)
  const [distance, setDistance] = useState(0)
  const type = exercise?.type ?? 'reps'
  const nextSet = accessory.loggedSets.length + 1

  const handleLog = () => {
    const set: Partial<AccessorySet> = {
      exerciseId: accessory.exerciseId,
      setNumber: nextSet,
      weight: accessory.calculatedWeight,
      reps: type === 'reps' ? reps : null,
      duration: type === 'timed' ? duration : null,
      distance: type === 'distance' ? distance : null,
    }
    logAccessorySet(accessory.exerciseId, set)
    // last set of this exercise → transition to next; otherwise same exercise → normal
    startRest(nextSet >= 5 ? 'transition' : 'normal')
    setReps(10)
    setDuration(null)
    setDistance(0)
  }

  const done = accessory.loggedSets.length >= 5

  return (
    <div className="border border-border p-3 mb-3">
      <div className="text-text text-sm mb-1 uppercase tracking-widest">
        {accessory.exerciseName}
        <span className="text-muted ml-2 text-xs">5x10 @ {accessory.calculatedWeight}lb</span>
      </div>
      {accessory.loggedSets.map((s, i) => (
        <div key={i} className="text-muted text-xs pl-2 py-0.5">
          Set {i + 1}:
          {s.reps != null && <> {s.reps} reps</>}
          {s.duration != null && <> {s.duration}s</>}
          {s.distance != null && <> {s.distance}ft</>}
          <span className="text-accent ml-2">done</span>
        </div>
      ))}
      {!done && (
        <div className="flex items-center gap-2 mt-2 pl-2">
          <span className="text-warn text-xs">Set {nextSet}:</span>
          {type === 'reps' && (
            <Stepper value={reps} onChange={setReps} step={1} min={0} />
          )}
          {type === 'timed' && (
            <DurationInput value={duration} onChange={setDuration} />
          )}
          {type === 'distance' && (
            <Stepper value={distance} onChange={setDistance} step={1} min={0} />
          )}
          <button
            onClick={handleLog}
            className="border border-accent text-accent px-3 py-1 font-mono text-xs"
          >
            LOG
          </button>
        </div>
      )}
    </div>
  )
}

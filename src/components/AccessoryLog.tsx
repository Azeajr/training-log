import { useState, useRef } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import type { AccessorySet, Exercise } from '../db/db'
import { db } from '../db/db'
import { ACCESSORY_PERCENTAGE, roundToNearest5 } from '../lib/calc'
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
  const [weight, setWeight] = useState(() => {
    const last = accessory.loggedSets[accessory.loggedSets.length - 1]
    return last?.weight ?? accessory.calculatedWeight ?? 0
  })
  const [weightEditing, setWeightEditing] = useState(false)
  const [reps, setReps] = useState(10)
  const [duration, setDuration] = useState<number | null>(null)
  const [distance, setDistance] = useState(0)
  const tmWritten = useRef(false)
  const type = exercise?.type ?? 'reps'
  const nextSet = accessory.loggedSets.length + 1

  const handleLog = async () => {
    if (weight !== (accessory.calculatedWeight ?? 0) && !tmWritten.current) {
      const newTm = roundToNearest5(weight / ACCESSORY_PERCENTAGE)
      const tms = await db.accessoryTrainingMaxes
        .where('exerciseId').equals(accessory.exerciseId)
        .sortBy('setAt')
      const currentTm = tms[tms.length - 1]
      await db.accessoryTrainingMaxes.add({
        exerciseId: accessory.exerciseId,
        weight: newTm,
        incrementLb: currentTm?.incrementLb ?? 5,
        setAt: new Date(),
      })
      tmWritten.current = true
    }
    const set: Partial<AccessorySet> = {
      exerciseId: accessory.exerciseId,
      setNumber: nextSet,
      weight,
      reps: type === 'reps' ? reps : null,
      duration: type === 'timed' ? duration : null,
      distance: type === 'distance' ? distance : null,
    }
    logAccessorySet(accessory.exerciseId, set)
    startRest(nextSet >= 5 ? 'transition' : 'normal')
    setReps(10)
    setDuration(null)
    setDistance(0)
    setWeightEditing(false)
  }

  const done = accessory.loggedSets.length >= 5

  return (
    <div className="border border-border p-3 mb-3">
      <div className="text-text text-sm mb-1 uppercase tracking-widest">
        {accessory.exerciseName}
        <span className="text-muted ml-2 text-xs">5x10 @</span>
        <button
          onClick={() => setWeightEditing(w => !w)}
          className={`text-xs font-mono ml-1 border-b ${weightEditing ? 'text-accent border-accent' : 'text-muted border-muted border-dashed'}`}
        >
          {weight}lb
        </button>
      </div>
      {weightEditing && (
        <div className="flex items-center gap-2 pl-2 mb-2">
          <span className="text-xs text-faint uppercase tracking-widest w-8">wt</span>
          <Stepper value={weight} onChange={setWeight} step={2.5} min={0} />
        </div>
      )}
      {accessory.loggedSets.map((s, i) => (
        <div key={i} className="text-muted text-xs pl-2 py-0.5">
          Set {i + 1}:
          {s.weight != null && <> {s.weight}lb</>}
          {s.reps != null && <> × {s.reps}</>}
          {s.duration != null && <> {s.duration}s</>}
          {s.distance != null && <> {s.distance}ft</>}
          <span className="text-accent ml-2">done</span>
        </div>
      ))}
      {!done && (
        <div className="flex items-center gap-2 mt-2 pl-2">
          <span className="text-warn text-xs">Set {nextSet}:</span>
          <span className="text-muted font-mono text-xs">{weight}lb ×</span>
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

import { useState, useRef } from 'react'
import { useWorkoutStore } from '../store/workoutStore'
import type { AccessorySet, Exercise } from '../db/db-v2'
import { db } from '../db/db-v2'
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
  const { logAccessorySet, editAccessorySet, deleteLastAccessorySet, removeAccessory, startRest } = useWorkoutStore()
  const [weight, setWeight] = useState(() => {
    const last = accessory.loggedSets[accessory.loggedSets.length - 1]
    return last?.weight ?? accessory.calculatedWeight ?? 0
  })
  const [weightEditing, setWeightEditing] = useState(false)
  const [reps, setReps] = useState(10)
  const [duration, setDuration] = useState<number | null>(null)
  const [distance, setDistance] = useState(0)
  const [editingSetIdx, setEditingSetIdx] = useState<number | null>(null)
  const [editWeight, setEditWeight] = useState(0)
  const [editReps, setEditReps] = useState(0)
  const [editDuration, setEditDuration] = useState<number | null>(null)
  const [editDistance, setEditDistance] = useState(0)
  const [undoConfirm, setUndoConfirm] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const tmWritten = useRef(false)
  const type = exercise?.type ?? 'reps'
  const nextSet = accessory.loggedSets.length + 1

  const startEditSet = (i: number) => {
    const s = accessory.loggedSets[i]
    setEditWeight(s.weight ?? 0)
    setEditReps(s.reps ?? 10)
    setEditDuration(s.duration ?? null)
    setEditDistance(s.distance ?? 0)
    setEditingSetIdx(i)
  }

  const saveEditSet = (i: number) => {
    editAccessorySet(accessory.exerciseId, i, {
      weight: editWeight,
      reps: type === 'reps' ? editReps : null,
      duration: type === 'timed' ? editDuration : null,
      distance: type === 'distance' ? editDistance : null,
    })
    setEditingSetIdx(null)
  }

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
      <div className="text-text text-sm mb-1 uppercase tracking-widest flex items-center">
        <span className="flex-1">
          {accessory.exerciseName}
          <span className="text-muted ml-2 text-xs">5x10 @</span>
          <button
            onClick={() => setWeightEditing(w => !w)}
            className={`text-xs font-mono ml-1 border-b ${weightEditing ? 'text-accent border-accent' : 'text-muted border-muted border-dashed'}`}
          >
            {weight}lb
          </button>
        </span>
        {!removeConfirm ? (
          <button onClick={() => setRemoveConfirm(true)} className="text-faint text-xs font-mono hover:text-danger ml-2">✕</button>
        ) : (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-danger text-xs">remove?</span>
            <button onClick={() => removeAccessory(accessory.exerciseId)} className="text-danger text-xs font-mono border border-danger px-1">yes</button>
            <button onClick={() => setRemoveConfirm(false)} className="text-muted text-xs font-mono">no</button>
          </div>
        )}
      </div>
      {weightEditing && (
        <div className="flex items-center gap-2 pl-2 mb-2">
          <span className="text-xs text-faint uppercase tracking-widest w-8">wt</span>
          <Stepper value={weight} onChange={setWeight} step={2.5} min={0} />
        </div>
      )}
      {accessory.loggedSets.map((s, i) => {
        const isLast = i === accessory.loggedSets.length - 1
        if (editingSetIdx === i) {
          return (
            <div key={i} className="flex items-center gap-2 pl-2 py-1 flex-wrap">
              <span className="text-warn text-xs">Set {i + 1}:</span>
              <Stepper value={editWeight} onChange={setEditWeight} step={2.5} min={0} />
              <span className="text-muted text-xs">lb ×</span>
              {type === 'reps' && <Stepper value={editReps} onChange={setEditReps} step={1} min={0} />}
              {type === 'timed' && <DurationInput value={editDuration} onChange={setEditDuration} />}
              {type === 'distance' && <Stepper value={editDistance} onChange={setEditDistance} step={1} min={0} />}
              <button onClick={() => saveEditSet(i)} className="border border-accent text-accent px-2 py-0.5 font-mono text-xs">SAVE</button>
              <button onClick={() => setEditingSetIdx(null)} className="text-muted text-xs">cancel</button>
            </div>
          )
        }
        return (
          <div key={i} className="flex items-center gap-1 text-muted text-xs pl-2 py-0.5">
            <span onClick={() => startEditSet(i)} className="cursor-pointer hover:text-text-dim">
              Set {i + 1}:
              {s.weight != null && <> {s.weight}lb</>}
              {s.reps != null && <> × {s.reps}</>}
              {s.duration != null && <> {s.duration}s</>}
              {s.distance != null && <> {s.distance}ft</>}
            </span>
            <span className="text-accent ml-1">done</span>
            {isLast && !undoConfirm && (
              <button onClick={() => setUndoConfirm(true)} className="ml-auto text-faint text-xs hover:text-danger font-mono">undo</button>
            )}
            {isLast && undoConfirm && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-danger text-xs">undo set?</span>
                <button onClick={() => { deleteLastAccessorySet(accessory.exerciseId); setUndoConfirm(false) }} className="text-danger text-xs font-mono border border-danger px-1">yes</button>
                <button onClick={() => setUndoConfirm(false)} className="text-muted text-xs font-mono">no</button>
              </div>
            )}
          </div>
        )
      })}
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

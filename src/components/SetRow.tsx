import { useState, useEffect, useRef } from 'react'
import type { Set } from '../db/db'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../lib/calc'
import Stepper from './Stepper'
import PlateDisplay from './PlateDisplay'

interface Props {
  set: Omit<Set, 'id' | 'sessionId'> & { isAmrap?: boolean }
  isActive: boolean
  isCompleted: boolean
  loggedReps?: number
  loggedWeight?: number
  amrapTargets?: AmrapTarget[]
  onLog: (reps: number, weight: number) => void
  onEdit: (reps: number, weight: number) => void
}

export default function SetRow({ set, isActive, isCompleted, loggedReps, loggedWeight, amrapTargets, onLog, onEdit }: Props) {
  const [reps, setReps] = useState(set.reps)
  const [weight, setWeight] = useState(set.weight)
  const [weightEditing, setWeightEditing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editReps, setEditReps] = useState(loggedReps ?? set.reps)
  const [editWeight, setEditWeight] = useState(loggedWeight ?? set.weight)
  const rowRef = useRef<HTMLDivElement>(null)

  const isAmrap = set.isAmrap ?? false

  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive && !isCompleted) setWeight(set.weight)
  }, [set.weight])

  if (isCompleted && !editing) {
    return (
      <div
        className="flex items-center gap-3 py-3 pl-3 text-sm text-muted cursor-pointer hover:text-text-dim active:text-text border-l-4 border-transparent"
        onClick={() => { setEditing(true); setEditReps(loggedReps ?? set.reps); setEditWeight(loggedWeight ?? set.weight) }}
      >
        <span className="w-16 text-right font-mono">{loggedWeight ?? set.weight}lb</span>
        <span>x {loggedReps}</span>
        {isAmrap && <span className="text-xs tracking-widest">AMRAP</span>}
        <span className="text-accent text-xs tracking-widest">done</span>
      </div>
    )
  }

  if (isCompleted && editing) {
    return (
      <div className="flex items-center gap-3 py-3 pl-3 border-l-4 border-accent flex-wrap">
        <Stepper value={editWeight} onChange={setEditWeight} step={2.5} min={0} />
        <span className="text-text-dim font-mono text-sm">×</span>
        <Stepper value={editReps} onChange={setEditReps} step={1} min={0} />
        <button
          onClick={() => { onEdit(editReps, editWeight); setEditing(false) }}
          className="border border-accent text-accent px-3 py-2 text-xs font-mono tracking-widest"
        >
          SAVE
        </button>
        <button onClick={() => setEditing(false)} className="text-muted text-xs font-mono">cancel</button>
      </div>
    )
  }

  if (isActive) {
    return (
      <div ref={rowRef} className="border-l-4 border-accent pl-3 py-3 mb-1">
        <div className="flex items-baseline gap-3">
          <button
            onClick={() => setWeightEditing(w => !w)}
            className={`text-2xl font-mono border-b-2 ${weightEditing ? 'text-accent border-accent' : 'text-text border-muted border-dashed'}`}
          >
            {weight}<span className="text-base ml-1">lb</span>
          </button>
          <span className="text-xl text-text">x {set.reps}{isAmrap ? '+' : ''}</span>
          {isAmrap && <span className="text-warn text-xs tracking-widest">AMRAP</span>}
          {set.type === 'joker' && <span className="text-warn text-xs tracking-widest">JOKER</span>}
        </div>
        <PlateDisplay weight={weight} />
        {isAmrap && amrapTargets && amrapTargets.length > 0 && (
          <AmrapTargets targets={amrapTargets} />
        )}
        <div className="mt-3 flex flex-col gap-2">
          {weightEditing && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint uppercase tracking-widest w-8">wt</span>
              <Stepper value={weight} onChange={setWeight} step={2.5} min={0} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-faint uppercase tracking-widest w-8">reps</span>
            <Stepper value={reps} onChange={setReps} step={1} min={0} />
          </div>
          <button
            onClick={() => { onLog(reps, weight); setReps(set.reps); setWeightEditing(false) }}
            className="w-full border border-accent text-accent py-4 font-mono text-base tracking-widest"
          >
            LOG
          </button>
        </div>
      </div>
    )
  }

  const isJoker = set.type === 'joker'

  return (
    <div className="flex items-center gap-3 py-2.5 pl-3 text-sm text-muted border-l-4 border-transparent">
      <span className="w-16 text-right font-mono">{set.weight}lb</span>
      <span>x {set.reps}{isAmrap ? '+' : ''}</span>
      {isAmrap && <span className="text-xs text-faint tracking-widest">AMRAP</span>}
      {isJoker && <span className="text-xs text-faint tracking-widest">JOKER</span>}
    </div>
  )
}

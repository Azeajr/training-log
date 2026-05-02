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
  amrapTargets?: AmrapTarget[]
  onLog: (reps: number) => void
  onEdit: (reps: number) => void
}

export default function SetRow({ set, isActive, isCompleted, loggedReps, amrapTargets, onLog, onEdit }: Props) {
  const [reps, setReps] = useState(set.reps)
  const [editing, setEditing] = useState(false)
  const [editReps, setEditReps] = useState(loggedReps ?? set.reps)
  const rowRef = useRef<HTMLDivElement>(null)

  const isAmrap = set.isAmrap ?? false

  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isActive])

  if (isCompleted && !editing) {
    return (
      <div
        className="flex items-center gap-3 py-3 pl-3 text-sm text-muted cursor-pointer hover:text-text-dim active:text-text border-l-4 border-transparent"
        onClick={() => { setEditing(true); setEditReps(loggedReps ?? set.reps) }}
      >
        <span className="w-16 text-right font-mono">{set.weight}lb</span>
        <span>x {loggedReps}</span>
        {isAmrap && <span className="text-xs tracking-widest">AMRAP</span>}
        <span className="text-accent text-xs tracking-widest">done</span>
      </div>
    )
  }

  if (isCompleted && editing) {
    return (
      <div className="flex items-center gap-3 py-3 pl-3 border-l-4 border-accent flex-wrap">
        <span className="text-text-dim font-mono text-sm">{set.weight}lb ×</span>
        <Stepper value={editReps} onChange={setEditReps} step={1} min={0} />
        <button
          onClick={() => { onEdit(editReps); setEditing(false) }}
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
          <span className="text-2xl font-mono text-text">
            {set.weight}<span className="text-base text-muted ml-1">lb</span>
          </span>
          <span className="text-xl text-text">x {set.reps}{isAmrap ? '+' : ''}</span>
          {isAmrap && <span className="text-warn text-xs tracking-widest">AMRAP</span>}
        </div>
        <PlateDisplay weight={set.weight} />
        {isAmrap && amrapTargets && amrapTargets.length > 0 && (
          <AmrapTargets targets={amrapTargets} />
        )}
        <div className="mt-3 flex flex-col gap-2">
          <Stepper value={reps} onChange={setReps} step={1} min={0} />
          <button
            onClick={() => { onLog(reps); setReps(set.reps) }}
            className="w-full border border-accent text-accent py-4 font-mono text-base tracking-widest"
          >
            LOG
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-2.5 pl-3 text-sm text-muted border-l-4 border-transparent">
      <span className="w-16 text-right font-mono">{set.weight}lb</span>
      <span>x {set.reps}{isAmrap ? '+' : ''}</span>
      {isAmrap && <span className="text-xs text-faint tracking-widest">AMRAP</span>}
    </div>
  )
}

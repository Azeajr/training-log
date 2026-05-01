import { useState } from 'react'
import type { Set } from '../db/db'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../lib/calc'

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
  const [reps, setReps] = useState('')
  const [editing, setEditing] = useState(false)
  const [editReps, setEditReps] = useState(String(loggedReps ?? set.reps))

  const handleLog = () => {
    const r = parseInt(reps)
    if (!r && r !== 0) return
    onLog(r)
    setReps('')
  }

  const handleEdit = () => {
    const r = parseInt(editReps)
    if (!r && r !== 0) return
    onEdit(r)
    setEditing(false)
  }

  const isAmrap = set.isAmrap ?? false

  if (isCompleted && !editing) {
    return (
      <div
        className="flex items-center gap-3 py-1 pl-2 text-sm text-zinc-500 cursor-pointer hover:text-zinc-300"
        onClick={() => { setEditing(true); setEditReps(String(loggedReps ?? set.reps)) }}
      >
        <span className="w-16 text-right">{set.weight}lb</span>
        <span>x {loggedReps}</span>
        {isAmrap && <span className="text-xs">AMRAP</span>}
        <span className="text-green-400 text-xs">done</span>
      </div>
    )
  }

  if (isCompleted && editing) {
    return (
      <div className="flex items-center gap-3 py-1 pl-2 text-sm border-l-2 border-green-400">
        <span className="w-16 text-right text-zinc-400">{set.weight}lb</span>
        <input
          type="number"
          value={editReps}
          onChange={e => setEditReps(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-2 py-0.5 w-14 text-center focus:outline-none focus:border-green-400"
          autoFocus
        />
        <button onClick={handleEdit} className="border border-green-400 text-green-400 px-2 py-0.5 text-xs font-mono">SAVE</button>
        <button onClick={() => setEditing(false)} className="text-zinc-500 text-xs font-mono">cancel</button>
      </div>
    )
  }

  if (isActive) {
    return (
      <div className="border-l-2 border-green-400 pl-2 py-1">
        <div className="flex items-center gap-3 text-sm">
          <span className="w-16 text-right text-zinc-100">{set.weight}lb</span>
          <span className="text-zinc-100">x {set.reps}{isAmrap ? '+' : ''}</span>
          {isAmrap && <span className="text-amber-400 text-xs">AMRAP</span>}
        </div>
        {isAmrap && amrapTargets && amrapTargets.length > 0 && (
          <AmrapTargets targets={amrapTargets} />
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-zinc-500 text-xs">REPS:</span>
          <input
            type="number"
            min={0}
            value={reps}
            onChange={e => setReps(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLog()}
            className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-2 py-1 w-16 text-center focus:outline-none focus:border-green-400"
            placeholder={String(set.reps)}
            autoFocus
          />
          <button onClick={handleLog} className="border border-green-400 text-green-400 px-3 py-1 font-mono text-xs">LOG</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-1 pl-2 text-sm text-zinc-600">
      <span className="w-16 text-right">{set.weight}lb</span>
      <span>x {set.reps}{isAmrap ? '+' : ''}</span>
      {isAmrap && <span className="text-xs text-zinc-700">AMRAP</span>}
    </div>
  )
}

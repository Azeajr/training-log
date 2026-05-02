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
    const r = reps === '' ? set.reps : parseInt(reps)
    if (isNaN(r) || r < 0) return
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
        className="flex items-center gap-3 py-3 pl-3 text-sm text-zinc-500 cursor-pointer hover:text-zinc-300 active:text-zinc-100 border-l-4 border-transparent"
        onClick={() => { setEditing(true); setEditReps(String(loggedReps ?? set.reps)) }}
      >
        <span className="w-16 text-right font-mono">{set.weight}lb</span>
        <span>x {loggedReps}</span>
        {isAmrap && <span className="text-xs tracking-widest">AMRAP</span>}
        <span className="text-green-400 text-xs tracking-widest">done</span>
      </div>
    )
  }

  if (isCompleted && editing) {
    return (
      <div className="flex items-center gap-3 py-3 pl-3 text-sm border-l-4 border-green-400">
        <span className="w-16 text-right text-zinc-400 font-mono">{set.weight}lb</span>
        <input
          type="number"
          value={editReps}
          onChange={e => setEditReps(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-2 py-2 w-16 text-center focus:outline-none focus:border-green-400"
          autoFocus
        />
        <button onClick={handleEdit} className="border border-green-400 text-green-400 px-3 py-2 text-xs font-mono tracking-widest">SAVE</button>
        <button onClick={() => setEditing(false)} className="text-zinc-500 text-xs font-mono">cancel</button>
      </div>
    )
  }

  if (isActive) {
    return (
      <div className="border-l-4 border-green-400 pl-3 py-3 mb-1">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-mono text-zinc-100">
            {set.weight}<span className="text-base text-zinc-500 ml-1">lb</span>
          </span>
          <span className="text-xl text-zinc-100">x {set.reps}{isAmrap ? '+' : ''}</span>
          {isAmrap && <span className="text-amber-400 text-xs tracking-widest">AMRAP</span>}
        </div>
        {isAmrap && amrapTargets && amrapTargets.length > 0 && (
          <AmrapTargets targets={amrapTargets} />
        )}
        <div className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            type="number"
            min={0}
            value={reps}
            onChange={e => setReps(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLog()}
            className="w-full md:w-20 bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-3 py-4 md:py-2 text-center text-2xl md:text-base focus:outline-none focus:border-green-400"
            placeholder={String(set.reps)}
            autoFocus
          />
          <button
            onClick={handleLog}
            className="w-full md:flex-1 border border-green-400 text-green-400 py-4 md:py-2 font-mono text-base md:text-sm tracking-widest"
          >
            LOG
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-2.5 pl-3 text-sm text-zinc-600 border-l-4 border-transparent">
      <span className="w-16 text-right font-mono">{set.weight}lb</span>
      <span>x {set.reps}{isAmrap ? '+' : ''}</span>
      {isAmrap && <span className="text-xs text-zinc-700 tracking-widest">AMRAP</span>}
    </div>
  )
}

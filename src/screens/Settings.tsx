import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Lift, Exercise } from '../db/db'
import { useSettingsStore } from '../store/settingsStore'

export default function Settings() {
  const { restTimer1, restTimer2, restTimerFail, update } = useSettingsStore()
  const [lifts, setLifts] = useState<Lift[]>([])
  const [tms, setTms] = useState<Record<number, number>>({})
  const [editingTm, setEditingTm] = useState<number | null>(null)
  const [tmInput, setTmInput] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [newExName, setNewExName] = useState('')
  const [newExType, setNewExType] = useState<'reps' | 'timed' | 'distance'>('reps')
  const [showAddEx, setShowAddEx] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const allLifts = await db.lifts.orderBy('order').toArray()
    setLifts(allLifts)
    const tmMap: Record<number, number> = {}
    for (const l of allLifts) {
      const tmsArr = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
      const latest = tmsArr[tmsArr.length - 1]
      if (latest) tmMap[l.id!] = latest.weight
    }
    setTms(tmMap)
    const allEx = await db.exercises.toArray()
    setExercises(allEx)
  }

  const handleSaveTm = async (liftId: number) => {
    const w = parseFloat(tmInput)
    if (!w || w <= 0) return
    await db.trainingMaxes.add({ liftId, weight: w, setAt: new Date() })
    setEditingTm(null)
    setTmInput('')
    load()
  }

  const handleAddExercise = async () => {
    if (!newExName.trim()) return
    await db.exercises.add({ name: newExName.trim(), type: newExType })
    setNewExName('')
    setShowAddEx(false)
    load()
  }

  const handleDeleteExercise = async (id: number) => {
    const used = await db.accessorySets.where('exerciseId').equals(id).count()
    if (used > 0) return
    await db.exercises.delete(id)
    setDeleteConfirm(null)
    load()
  }

  const handleExportJson = async () => {
    const data = {
      lifts: await db.lifts.toArray(),
      trainingMaxes: await db.trainingMaxes.toArray(),
      accessoryTrainingMaxes: await db.accessoryTrainingMaxes.toArray(),
      cycles: await db.cycles.toArray(),
      sessions: await db.sessions.toArray(),
      sets: await db.sets.toArray(),
      exercises: await db.exercises.toArray(),
      liftAccessories: await db.liftAccessories.toArray(),
      accessorySets: await db.accessorySets.toArray(),
      settings: await db.settings.toArray(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training-log-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const timerStep = (field: 'restTimer1' | 'restTimer2' | 'restTimerFail', delta: number) => {
    const current = { restTimer1, restTimer2, restTimerFail }[field]
    const next = Math.max(30, current + delta)
    update({ [field]: next })
  }

  const fmtTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="p-4 font-mono text-sm">

      {/* Training Maxes */}
      <div className="mb-6">
        <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
          --- TRAINING MAXES --------------------------------
        </div>
        {lifts.map(l => (
          <div key={l.id} className="flex items-center gap-3 py-1 border-b border-zinc-800">
            <span className="text-zinc-500 w-20 uppercase tracking-widest text-xs">{l.name}</span>
            {editingTm === l.id ? (
              <>
                <input
                  type="number"
                  value={tmInput}
                  onChange={e => setTmInput(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-0.5 w-20 focus:outline-none focus:border-green-400"
                  autoFocus
                />
                <span className="text-zinc-500">lb</span>
                <button onClick={() => handleSaveTm(l.id!)} className="text-green-400 text-xs">SAVE</button>
                <button onClick={() => setEditingTm(null)} className="text-zinc-500 text-xs">cancel</button>
              </>
            ) : (
              <>
                <span className="text-zinc-100">{tms[l.id!] ?? '—'} lb</span>
                <button
                  onClick={() => { setEditingTm(l.id!); setTmInput(String(tms[l.id!] ?? '')) }}
                  className="text-zinc-500 text-xs hover:text-green-400"
                >
                  edit
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Rest Timers */}
      <div className="mb-6">
        <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
          --- REST TIMERS -----------------------------------
        </div>
        {(
          [
            { label: 'First', field: 'restTimer1' as const, value: restTimer1 },
            { label: 'Second', field: 'restTimer2' as const, value: restTimer2 },
            { label: 'Failed', field: 'restTimerFail' as const, value: restTimerFail },
          ]
        ).map(({ label, field, value }) => (
          <div key={field} className="flex items-center gap-3 py-1 border-b border-zinc-800">
            <span className="text-zinc-500 w-16 text-xs uppercase tracking-widest">{label}</span>
            <button onClick={() => timerStep(field, -30)} className="border border-zinc-700 px-2 py-0.5 text-zinc-500 hover:text-zinc-100">-</button>
            <span className="text-zinc-100 w-12 text-center">{fmtTimer(value)}</span>
            <button onClick={() => timerStep(field, 30)} className="border border-zinc-700 px-2 py-0.5 text-zinc-500 hover:text-zinc-100">+</button>
          </div>
        ))}
      </div>

      {/* Exercises */}
      <div className="mb-6">
        <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
          --- EXERCISES -------------------------------------
        </div>
        {exercises.map(ex => (
          <div key={ex.id} className="flex items-center justify-between py-1 border-b border-zinc-800">
            <span className="text-zinc-100">{ex.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 text-xs border border-zinc-800 px-1">{ex.type}</span>
              {deleteConfirm === ex.id ? (
                <>
                  <button onClick={() => handleDeleteExercise(ex.id!)} className="text-red-400 text-xs">DELETE</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-zinc-500 text-xs">cancel</button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(ex.id!)} className="text-zinc-700 text-xs hover:text-red-400">✕</button>
              )}
            </div>
          </div>
        ))}
        {showAddEx ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={newExName}
              onChange={e => setNewExName(e.target.value)}
              placeholder="Exercise name"
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-1 flex-1 focus:outline-none focus:border-green-400"
            />
            <select
              value={newExType}
              onChange={e => setNewExType(e.target.value as any)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-1 focus:outline-none"
            >
              <option value="reps">reps</option>
              <option value="timed">timed</option>
              <option value="distance">distance</option>
            </select>
            <button onClick={handleAddExercise} className="border border-green-400 text-green-400 px-2 py-1 text-xs">ADD</button>
            <button onClick={() => setShowAddEx(false)} className="text-zinc-500 text-xs">cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddEx(true)}
            className="mt-2 border border-zinc-700 text-zinc-500 px-3 py-1 text-xs hover:border-green-400 hover:text-green-400"
          >
            + ADD EXERCISE
          </button>
        )}
      </div>

      {/* Data Export */}
      <div>
        <div className="text-zinc-500 uppercase text-xs tracking-widest mb-2">
          --- DATA ------------------------------------------
        </div>
        <button
          onClick={handleExportJson}
          className="border border-zinc-700 px-4 py-2 text-zinc-500 text-xs uppercase tracking-widest hover:border-green-400 hover:text-green-400"
        >
          EXPORT JSON
        </button>
      </div>
    </div>
  )
}

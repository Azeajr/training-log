import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Exercise, LiftAccessory } from '../db/db'
import DurationInput from '../components/DurationInput'
import Rule from '../components/Rule'

interface EditSet {
  id: number
  type: 'warmup' | 'main' | 'fsl'
  setNumber: number
  weight: number
  reps: number
  isAmrap: boolean
}

interface EditAccSet {
  id?: number
  setNumber: number
  weight: number | null
  reps: number | null
  duration: number | null
  distance: number | null
}

interface EditAccessory {
  originalExerciseId: number  // -1 for newly added groups
  exerciseId: number
  exerciseName: string
  exerciseType: 'reps' | 'timed' | 'distance'
  sets: EditAccSet[]
}

interface LiftExercise {
  exercise: Exercise
  liftAccessory: LiftAccessory
}

export default function HistoryEdit() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const sid = parseInt(sessionId ?? '0')

  const [sessionInfo, setSessionInfo] = useState<{ liftName: string; week: number; date: string } | null>(null)
  const [editSets, setEditSets] = useState<EditSet[]>([])
  const [editAccessories, setEditAccessories] = useState<EditAccessory[]>([])
  const [deletedAccessoryIds, setDeletedAccessoryIds] = useState<number[]>([])
  const [notes, setNotes] = useState('')
  const [liftExercises, setLiftExercises] = useState<LiftExercise[]>([])
  // showPicker: index into editAccessories to swap, or -1 to add new, or null = closed
  const [showPicker, setShowPicker] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { load() }, [sid])

  const load = async () => {
    const session = await db.sessions.get(sid)
    if (!session) return
    const lift = await db.lifts.get(session.liftId)
    if (!lift) return

    setSessionInfo({
      liftName: lift.name,
      week: session.week,
      date: new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    })
    setNotes(session.notes ?? '')

    const dbSets = await db.sets.where('sessionId').equals(sid).toArray()
    const typeOrder = { warmup: 0, main: 1, fsl: 2 }
    dbSets.sort((a, b) => {
      const td = typeOrder[a.type] - typeOrder[b.type]
      return td !== 0 ? td : a.setNumber - b.setNumber
    })
    setEditSets(dbSets.map(s => ({
      id: s.id!,
      type: s.type,
      setNumber: s.setNumber,
      weight: s.weight,
      reps: s.reps,
      isAmrap: s.isAmrap,
    })))

    const dbAccSets = await db.accessorySets.where('sessionId').equals(sid).toArray()
    const allExercises = await db.exercises.toArray()

    const grouped = new Map<number, EditAccSet[]>()
    for (const s of dbAccSets) {
      if (!grouped.has(s.exerciseId)) grouped.set(s.exerciseId, [])
      grouped.get(s.exerciseId)!.push({
        id: s.id,
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        duration: s.duration,
        distance: s.distance,
      })
    }
    for (const sets of grouped.values()) {
      sets.sort((a, b) => a.setNumber - b.setNumber)
    }

    const accessories: EditAccessory[] = []
    for (const [exId, sets] of grouped) {
      const ex = allExercises.find(e => e.id === exId)
      if (!ex) continue
      accessories.push({
        originalExerciseId: exId,
        exerciseId: exId,
        exerciseName: ex.name,
        exerciseType: ex.type,
        sets,
      })
    }
    setEditAccessories(accessories)

    const liftAccs = await db.liftAccessories.where('liftId').equals(lift.id!).sortBy('order')
    const liftExIds = liftAccs.map(la => la.exerciseId)
    const liftExList = await db.exercises.where('id').anyOf(liftExIds).toArray()
    setLiftExercises(
      liftAccs
        .map(la => ({ liftAccessory: la, exercise: liftExList.find(e => e.id === la.exerciseId)! }))
        .filter(r => r.exercise)
    )
  }

  const updateSet = (idx: number, field: 'weight' | 'reps', raw: string) => {
    const num = parseFloat(raw)
    if (isNaN(num)) return
    setEditSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: num } : s))
  }

  const updateAccSet = (accIdx: number, setIdx: number, field: keyof EditAccSet, value: number | null) => {
    setEditAccessories(prev => prev.map((acc, ai) => {
      if (ai !== accIdx) return acc
      return { ...acc, sets: acc.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) }
    }))
  }

  const deleteAccessory = (accIdx: number) => {
    const acc = editAccessories[accIdx]
    if (acc.originalExerciseId !== -1) {
      setDeletedAccessoryIds(prev => [...prev, acc.originalExerciseId])
    }
    setEditAccessories(prev => prev.filter((_, i) => i !== accIdx))
  }

  const handlePickExercise = (ex: Exercise) => {
    if (showPicker === null) return
    if (showPicker === -1) {
      setEditAccessories(prev => [...prev, {
        originalExerciseId: -1,
        exerciseId: ex.id!,
        exerciseName: ex.name,
        exerciseType: ex.type,
        sets: Array.from({ length: 5 }, (_, i) => ({
          setNumber: i + 1,
          weight: null,
          reps: null,
          duration: null,
          distance: null,
        })),
      }])
    } else {
      setEditAccessories(prev => prev.map((acc, i) => {
        if (i !== showPicker) return acc
        const typeChanged = acc.exerciseType !== ex.type
        return {
          ...acc,
          exerciseId: ex.id!,
          exerciseName: ex.name,
          exerciseType: ex.type,
          sets: typeChanged
            ? acc.sets.map(s => ({ ...s, weight: null, reps: null, duration: null, distance: null }))
            : acc.sets,
        }
      }))
    }
    setShowPicker(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      for (const s of editSets) {
        await db.sets.update(s.id, { weight: s.weight, reps: s.reps })
      }

      for (const exId of deletedAccessoryIds) {
        await db.accessorySets
          .where('sessionId').equals(sid)
          .and(s => s.exerciseId === exId)
          .delete()
      }

      for (const acc of editAccessories) {
        if (acc.originalExerciseId === -1) {
          await db.accessorySets.bulkAdd(acc.sets.map(s => ({
            sessionId: sid,
            exerciseId: acc.exerciseId,
            setNumber: s.setNumber,
            weight: s.weight,
            reps: s.reps,
            duration: s.duration,
            distance: s.distance,
          })))
        } else if (acc.exerciseId !== acc.originalExerciseId) {
          await db.accessorySets
            .where('sessionId').equals(sid)
            .and(s => s.exerciseId === acc.originalExerciseId)
            .delete()
          await db.accessorySets.bulkAdd(acc.sets.map(s => ({
            sessionId: sid,
            exerciseId: acc.exerciseId,
            setNumber: s.setNumber,
            weight: s.weight,
            reps: s.reps,
            duration: s.duration,
            distance: s.distance,
          })))
        } else {
          for (const s of acc.sets) {
            if (s.id != null) {
              await db.accessorySets.update(s.id, {
                weight: s.weight,
                reps: s.reps,
                duration: s.duration,
                distance: s.distance,
              })
            }
          }
        }
      }

      await db.sessions.update(sid, { notes })
      navigate('/history')
    } finally {
      setIsSaving(false)
    }
  }

  if (!sessionInfo) return <div className="p-6 font-mono text-muted">Loading...</div>

  const setsByType = (type: 'warmup' | 'main' | 'fsl') =>
    editSets.map((s, i) => ({ s, i })).filter(({ s }) => s.type === type)

  return (
    <div className="p-4 font-mono pb-24 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/history')}
          className="text-muted hover:text-text text-xs tracking-widest"
        >
          ← BACK
        </button>
        <div className="text-muted text-xs tracking-widest uppercase">
          {sessionInfo.liftName} W{sessionInfo.week}
          <span className="text-muted ml-2">{sessionInfo.date}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="border border-accent text-accent px-4 py-1 text-xs font-mono tracking-widest hover:bg-accent hover:text-on-accent disabled:opacity-50"
        >
          {isSaving ? 'SAVING...' : 'SAVE'}
        </button>
      </div>

      {(['warmup', 'main', 'fsl'] as const).map(type => {
        const rows = setsByType(type)
        if (!rows.length) return null
        return (
          <div key={type} className="mb-6">
            <div className="text-muted uppercase text-xs tracking-widest mb-2">
              {type === 'fsl' ? 'FSL' : type}
            </div>
            {rows.map(({ s, i }) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <input
                  type="number"
                  value={s.weight}
                  onChange={e => updateSet(i, 'weight', e.target.value)}
                  className="bg-surface border border-border text-text font-mono px-2 py-1.5 w-20 text-center focus:outline-none focus:border-accent text-sm"
                />
                <span className="text-muted text-xs">lb ×</span>
                <input
                  type="number"
                  value={s.reps}
                  onChange={e => updateSet(i, 'reps', e.target.value)}
                  className="bg-surface border border-border text-text font-mono px-2 py-1.5 w-16 text-center focus:outline-none focus:border-accent text-sm"
                />
                {s.isAmrap && <span className="text-warn text-xs tracking-widest">AMRAP</span>}
              </div>
            ))}
          </div>
        )
      })}

      <div className="mb-6">
        <Rule label="ACCESSORIES" className="text-muted mb-2" />
        {editAccessories.map((acc, ai) => (
          <div key={ai} className="border border-border p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setShowPicker(ai)}
                className="text-text text-sm uppercase tracking-widest hover:text-accent"
              >
                {acc.exerciseName}
                <span className="text-muted text-xs ml-2 normal-case tracking-normal">tap to swap</span>
              </button>
              <button
                onClick={() => deleteAccessory(ai)}
                className="text-muted hover:text-danger text-xs font-mono px-1"
              >
                ✕
              </button>
            </div>
            {acc.sets.map((s, si) => (
              <div key={si} className="flex items-center gap-2 py-1 pl-2">
                <span className="text-muted text-xs w-10">Set {s.setNumber}</span>
                {acc.exerciseType === 'reps' && (
                  <>
                    <input
                      type="number"
                      value={s.weight ?? ''}
                      onChange={e => updateAccSet(ai, si, 'weight', parseFloat(e.target.value) || null)}
                      className="bg-surface border border-border text-text font-mono px-2 py-1 w-20 text-center focus:outline-none focus:border-accent text-xs"
                      placeholder="wt"
                    />
                    <span className="text-muted text-xs">lb ×</span>
                    <input
                      type="number"
                      value={s.reps ?? ''}
                      onChange={e => updateAccSet(ai, si, 'reps', parseInt(e.target.value) || null)}
                      className="bg-surface border border-border text-text font-mono px-2 py-1 w-14 text-center focus:outline-none focus:border-accent text-xs"
                      placeholder="reps"
                    />
                  </>
                )}
                {acc.exerciseType === 'timed' && (
                  <DurationInput
                    value={s.duration}
                    onChange={val => updateAccSet(ai, si, 'duration', val)}
                  />
                )}
                {acc.exerciseType === 'distance' && (
                  <input
                    type="number"
                    value={s.distance ?? ''}
                    onChange={e => updateAccSet(ai, si, 'distance', parseFloat(e.target.value) || null)}
                    className="bg-surface border border-border text-text font-mono px-2 py-1 w-24 text-center focus:outline-none focus:border-accent text-xs"
                    placeholder="ft"
                  />
                )}
              </div>
            ))}
          </div>
        ))}
        <button
          onClick={() => setShowPicker(-1)}
          className="w-full border border-border py-2 text-muted text-xs tracking-widest hover:border-accent hover:text-accent"
        >
          + ADD ACCESSORY
        </button>
      </div>

      <div className="mb-6">
        <div className="text-muted uppercase text-xs tracking-widest mb-2">NOTES</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full bg-surface border border-border text-text font-mono px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none"
          rows={3}
          placeholder="Session notes..."
        />
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full border border-accent text-accent py-4 font-mono text-sm tracking-widest hover:bg-accent hover:text-on-accent disabled:opacity-50"
      >
        {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
      </button>

      {showPicker !== null && (
        <div className="fixed inset-0 bg-bg z-50 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Rule label="SELECT EXERCISE" className="text-muted" />
            <button onClick={() => setShowPicker(null)} className="text-muted hover:text-text font-mono">✕</button>
          </div>
          <div className="space-y-1">
            {liftExercises.map(({ exercise }) => {
              const alreadyAdded = showPicker === -1
                && editAccessories.some(a => a.exerciseId === exercise.id)
              return (
                <button
                  key={exercise.id}
                  onClick={() => !alreadyAdded && handlePickExercise(exercise)}
                  disabled={alreadyAdded}
                  className={`w-full text-left px-3 py-2 border font-mono text-sm flex justify-between ${
                    alreadyAdded
                      ? 'border-border-dim text-muted'
                      : 'border-border text-text hover:border-accent hover:text-accent'
                  }`}
                >
                  <span>{exercise.name}{alreadyAdded ? ' ✓' : ''}</span>
                  <span className="text-muted text-xs uppercase">{exercise.type}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

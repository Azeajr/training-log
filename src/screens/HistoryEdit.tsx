import { createSignal, onMount, For, Show } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { Exercise, LiftAccessory } from '../types/domain'
import { SET_TYPE_EDIT_ORDER } from '../lib/calc'
import { formatDateLong } from '../lib/format'
import DurationInput from '../components/forms/DurationInput'
import Rule from '../components/layout/Rule'
import Stepper from '../components/forms/Stepper'

type PickerMode = { kind: 'add' } | { kind: 'swap'; accIdx: number } | null

interface EditSet {
  id: number
  type: string
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
  originalExerciseId: number | null
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
  const params = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const sid = parseInt(params.sessionId ?? '0')

  const [sessionInfo, setSessionInfo] = createSignal<{ liftName: string; week: number; date: string } | null>(null)
  const [liftId, setLiftId] = createSignal<number | null>(null)
  const [editSets, setEditSets] = createSignal<EditSet[]>([])
  const [editAccessories, setEditAccessories] = createSignal<EditAccessory[]>([])
  const [deletedAccessoryIds, setDeletedAccessoryIds] = createSignal<number[]>([])
  const [notes, setNotes] = createSignal('')
  const [liftExercises, setLiftExercises] = createSignal<LiftExercise[]>([])
  const [picker, setPicker] = createSignal<PickerMode>(null)
  const [isSaving, setIsSaving] = createSignal(false)

  onMount(() => { void load() })

  const load = async () => {
    const session = await db.sessions.get(sid)
    if (!session) return
    const lift = await db.lifts.get(session.liftId)
    if (!lift) return

    setLiftId(session.liftId)
    setSessionInfo({
      liftName: lift.name,
      week: session.week,
      date: formatDateLong(session.date),
    })
    setNotes(session.notes ?? '')

    const dbSets = await db.sets.where('sessionId').equals(sid).toArray()
    const typeOrder = Object.fromEntries(SET_TYPE_EDIT_ORDER.map((t, i) => [t, i])) as Record<string, number>
    dbSets.sort((a, b) => {
      const td = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99)
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

  const updateSet = (idx: number, field: 'weight' | 'reps', value: number) => {
    setEditSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const updateAccSet = (accIdx: number, setIdx: number, field: keyof EditAccSet, value: number | null) => {
    setEditAccessories(prev => prev.map((acc, ai) => {
      if (ai !== accIdx) return acc
      return { ...acc, sets: acc.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) }
    }))
  }

  const deleteAccessory = (accIdx: number) => {
    const acc = editAccessories()[accIdx]
    if (acc.originalExerciseId !== null) {
      setDeletedAccessoryIds(prev => [...prev, acc.originalExerciseId!])
    }
    setEditAccessories(prev => prev.filter((_, i) => i !== accIdx))
  }

  const handlePickExercise = (ex: Exercise) => {
    const p = picker()
    if (p === null) return
    if (p.kind === 'add') {
      setEditAccessories(prev => [...prev, {
        originalExerciseId: null,
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
        if (i !== p.accIdx) return acc
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
    setPicker(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await db.transaction(async () => {
        await Promise.all(editSets().map(s =>
          db.sets.update(s.id, { weight: s.weight, reps: s.reps })
        ))
        for (const exId of deletedAccessoryIds()) {
          await db.accessorySets
            .where('sessionId').equals(sid)
            .filter(s => s.exerciseId === exId)
            .delete()
        }
        for (const acc of editAccessories()) {
          if (acc.originalExerciseId !== null && acc.originalExerciseId !== acc.exerciseId) {
            await db.accessorySets
              .where('sessionId').equals(sid)
              .filter(s => s.exerciseId === acc.originalExerciseId)
              .delete()
          }
          const existing = acc.originalExerciseId === acc.exerciseId
            ? await db.accessorySets
                .where('sessionId').equals(sid)
                .filter(s => s.exerciseId === acc.exerciseId)
                .toArray()
            : []
          const existingByNum = new Map(existing.map(s => [s.setNumber, s]))
          const wantedNums = new Set(acc.sets.map(s => s.setNumber))
          const toInsert: typeof acc.sets[number][] = []
          for (const s of acc.sets) {
            const old = existingByNum.get(s.setNumber)
            if (old?.id != null) {
              await db.accessorySets.update(old.id, {
                weight: s.weight,
                reps: s.reps,
                duration: s.duration,
                distance: s.distance,
              })
            } else {
              toInsert.push(s)
            }
          }
          for (const old of existing) {
            if (!wantedNums.has(old.setNumber) && old.id != null) {
              await db.accessorySets.delete(old.id)
            }
          }
          if (toInsert.length > 0) {
            await db.accessorySets.bulkAdd(toInsert.map(s => ({
              sessionId: sid,
              exerciseId: acc.exerciseId,
              setNumber: s.setNumber,
              weight: s.weight,
              reps: s.reps,
              duration: s.duration,
              distance: s.distance,
            })))
          }
        }
        await db.sessions.update(sid, { notes: notes() })
      })
      navigate(liftId() != null ? `/history?liftId=${liftId()}` : '/history')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Show
      when={sessionInfo()}
      fallback={<div class="p-6 font-mono text-muted">Loading...</div>}
    >
      {info => (
        <div class="p-4 font-mono pb-24 max-w-3xl mx-auto">
          <div class="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(liftId() != null ? `/history?liftId=${liftId()}` : '/history')}
              class="text-muted hover:text-text text-xs tracking-widest"
            >
              ← BACK
            </button>
            <div class="text-muted text-xs tracking-widest uppercase">
              {info().liftName} W{info().week}
              <span class="text-muted ml-2">{info().date}</span>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving()}
              class="border border-accent text-accent px-4 py-1 text-xs font-mono tracking-widest disabled:opacity-50"
            >
              {isSaving() ? 'SAVING...' : 'SAVE'}
            </button>
          </div>

          <For each={SET_TYPE_EDIT_ORDER}>
            {type => {
              const rows = () => editSets()
                .map((s, i) => ({ s, i }))
                .filter(({ s }) => s.type === type)
              return (
                <Show when={rows().length > 0}>
                  <div class="mb-6">
                    <div class="text-muted uppercase text-xs tracking-widest mb-2">
                      {type.toUpperCase()}
                    </div>
                    <For each={rows()}>
                      {({ s, i }) => (
                        <div class="flex items-center gap-2 py-1.5 flex-wrap">
                          <Stepper value={s.weight} onChange={v => updateSet(i, 'weight', v)} step={2.5} min={0} />
                          <span class="text-muted text-xs">lb ×</span>
                          <Stepper value={s.reps} onChange={v => updateSet(i, 'reps', v)} step={1} min={0} />
                          <Show when={s.isAmrap}>
                            <span class="text-warn text-xs tracking-widest">AMRAP</span>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              )
            }}
          </For>

          <div class="mb-6">
            <Rule label="ACCESSORIES" class="text-muted mb-2" />
            <For each={editAccessories()}>
              {(acc, ai) => (
                <div class="border border-border p-3 mb-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="text-text text-sm uppercase tracking-widest">{acc.exerciseName}</span>
                      <button
                        onClick={() => setPicker({ kind: 'swap', accIdx: ai() })}
                        class="text-muted text-xs hover:text-accent"
                      >
                        swap
                      </button>
                    </div>
                    <button
                      onClick={() => deleteAccessory(ai())}
                      class="text-muted hover:text-danger text-xs font-mono px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <For each={acc.sets}>
                    {(s, si) => (
                      <div class="flex items-center flex-wrap gap-2 py-1 pl-2">
                        <span class="text-muted text-xs w-10">Set {s.setNumber}</span>
                        <Show when={acc.exerciseType === 'reps'}>
                          <>
                            <Stepper value={s.weight ?? 0} onChange={v => updateAccSet(ai(), si(), 'weight', v)} step={2.5} min={0} />
                            <span class="text-muted text-xs">lb ×</span>
                            <Stepper value={s.reps ?? 0} onChange={v => updateAccSet(ai(), si(), 'reps', v)} step={1} min={0} />
                          </>
                        </Show>
                        <Show when={acc.exerciseType === 'timed'}>
                          <>
                            <Stepper value={s.weight ?? 0} onChange={v => updateAccSet(ai(), si(), 'weight', v)} step={2.5} min={0} />
                            <span class="text-muted text-xs">lb ×</span>
                            <DurationInput
                              value={s.duration}
                              onChange={val => updateAccSet(ai(), si(), 'duration', val)}
                            />
                          </>
                        </Show>
                        <Show when={acc.exerciseType === 'distance'}>
                          <>
                            <Stepper value={s.weight ?? 0} onChange={v => updateAccSet(ai(), si(), 'weight', v)} step={2.5} min={0} />
                            <span class="text-muted text-xs">lb ×</span>
                            <Stepper value={s.distance ?? 0} onChange={v => updateAccSet(ai(), si(), 'distance', v)} step={1} min={0} />
                          </>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
            <button
              onClick={() => setPicker({ kind: 'add' })}
              class="w-full border border-border py-2 text-muted text-xs tracking-widest hover:border-accent hover:text-accent"
            >
              + ADD ACCESSORY
            </button>
          </div>

          <div class="mb-6">
            <div class="text-muted uppercase text-xs tracking-widest mb-2">NOTES</div>
            <textarea
              value={notes()}
              onInput={e => setNotes(e.currentTarget.value)}
              class="w-full bg-surface border border-border text-text font-mono px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none"
              rows={3}
              placeholder="Session notes..."
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving()}
            class="w-full border border-accent text-accent py-4 font-mono text-sm tracking-widest disabled:opacity-50"
          >
            {isSaving() ? 'SAVING...' : 'SAVE CHANGES'}
          </button>

          <Show when={picker() !== null}>
            <div class="fixed inset-0 bg-bg z-50 p-4 overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
                <button onClick={() => setPicker(null)} class="text-muted hover:text-text text-xs tracking-widest">← BACK</button>
                <Rule label="SELECT EXERCISE" class="text-muted" />
                <div class="w-14" />
              </div>
              <div class="space-y-1">
                <For each={liftExercises()}>
                  {({ exercise }) => {
                    const alreadyAdded = picker()?.kind === 'add'
                      && editAccessories().some(a => a.exerciseId === exercise.id)
                    return (
                      <button
                        onClick={() => !alreadyAdded && handlePickExercise(exercise)}
                        disabled={alreadyAdded}
                        class={`w-full text-left px-3 py-2 border font-mono text-sm flex justify-between ${
                          alreadyAdded
                            ? 'border-border-dim text-muted'
                            : 'border-border text-text hover:border-accent hover:text-accent'
                        }`}
                      >
                        <span>{exercise.name}{alreadyAdded ? ' ✓' : ''}</span>
                        <span class="text-muted text-xs uppercase">{exercise.type}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}

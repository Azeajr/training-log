import BandLoadControls from '../components/forms/BandLoadControls'
import { bandProfileFor, effectiveBandLoad } from '../lib/band-loading'
import { resolveLiftLoading, resolveExerciseLoading, type PlateLoading } from '../lib/plate-loading'
import { settings } from '../store/settings-store'
import { createSignal, onMount, For, Index, Show } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { Exercise, DropRound, BandLoad, BandProfile } from '../types/domain'
import { SET_TYPE_EDIT_ORDER } from '../lib/calc'
import { formatDateLong } from '../lib/format'
import DurationInput from '../components/forms/DurationInput'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import Stepper from '../components/forms/Stepper'
import NotesField from '../components/forms/NotesField'
import DropRoundsEditor from '../components/forms/DropRoundsEditor'
import Modal from '../components/modals/Modal'

type PickerMode = { kind: 'add' } | { kind: 'swap'; accIdx: number } | null

interface EditSet {
  bandLoad?: BandLoad | null
  id: number
  type: string
  /** The movement a cross set trained; absent on every other type. */
  liftId?: number | null
  setNumber: number
  weight: number
  reps: number
  isAmrap: boolean
}

interface EditAccSet {
  bandLoad?: BandLoad | null
  dropRounds?: DropRound[] | null
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
  notes: string
}

export default function HistoryEdit() {
  const params = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  // Coerce the URL slug to a finite positive integer; bind a NaN/negative
  // value into the SQL parameter binder otherwise. SQLite would treat it as
  // NULL and the page would silently render empty, masking the bad link.
  const sid = (() => {
    const n = Number(params.sessionId)
    return Number.isInteger(n) && n > 0 ? n : 0
  })()

  const [sessionInfo, setSessionInfo] = createSignal<{ liftName: string; week: number; date: string } | null>(null)
  const [liftProfiles, setLiftProfiles] = createSignal<Map<number, BandProfile | null>>(new Map())
  const [exerciseProfiles, setExerciseProfiles] = createSignal<Map<number, BandProfile | null>>(new Map())
  // Plate-loading per entity, so the added-weight hint under a band control
  // matches how that lift is actually loaded (belt singles vs bar pairs)
  // rather than assuming every banded movement is belt work.
  const [liftLoadings, setLiftLoadings] = createSignal<Map<number, PlateLoading | null>>(new Map())
  const [exerciseLoadings, setExerciseLoadings] = createSignal<Map<number, PlateLoading | null>>(new Map())
  const [liftNames, setLiftNames] = createSignal<Map<number, string>>(new Map())
  const [liftId, setLiftId] = createSignal<number | null>(null)
  const [editSets, setEditSets] = createSignal<EditSet[]>([])
  const [editAccessories, setEditAccessories] = createSignal<EditAccessory[]>([])
  const [deletedAccessoryIds, setDeletedAccessoryIds] = createSignal<number[]>([])
  const [notes, setNotes] = createSignal('')
  const [libraryExercises, setLibraryExercises] = createSignal<Exercise[]>([])
  const [picker, setPicker] = createSignal<PickerMode>(null)
  const [isSaving, setIsSaving] = createSignal(false)

  onMount(() => {
    if (sid === 0) {
      navigate('/history', { replace: true })
      return
    }
    void load()
  })

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
    // Movement names for cross sets. Two cross blocks in one session are
    // distinguished by nothing but their liftId, so merged under a bare CROSS
    // heading the user cannot tell which row is which — and editing the wrong
    // one is data corruption, not just a confusing label (F10).
    const allLifts = await db.lifts.toArray()
    setLiftNames(new Map(allLifts.map(l => [l.id!, l.name])))
    setLiftProfiles(new Map(allLifts.map(l => [l.id!, bandProfileFor(l)])))
    setLiftLoadings(new Map(allLifts.map(l => [l.id!, resolveLiftLoading(l, settings.barWeight)])))

    setEditSets(dbSets.map(s => ({
      id: s.id!,
      type: s.type,
      liftId: s.liftId,
      setNumber: s.setNumber,
      weight: s.weight,
      bandLoad: s.bandLoad ?? null,
      reps: s.reps,
      isAmrap: s.isAmrap,
    })))

    const dbAccSets = await db.accessorySets.where('sessionId').equals(sid).toArray()
    const dbAccNotes = await db.accessoryNotes.where('sessionId').equals(sid).toArray()
    const allExercises = await db.exercises.toArray()
    setExerciseProfiles(new Map(allExercises.map(e => [e.id!, bandProfileFor(e)])))
    setExerciseLoadings(new Map(allExercises.map(e => [e.id!, resolveExerciseLoading(e, settings.barWeight)])))
    const notesByExercise = new Map(dbAccNotes.map(n => [n.exerciseId, n.notes]))

    const grouped = new Map<number, EditAccSet[]>()
    for (const s of dbAccSets) {
      if (!grouped.has(s.exerciseId)) grouped.set(s.exerciseId, [])
      grouped.get(s.exerciseId)!.push({
        id: s.id,
        setNumber: s.setNumber,
        weight: s.weight,
        bandLoad: s.bandLoad ?? null,
        reps: s.reps,
        duration: s.duration,
        distance: s.distance,
        dropRounds: s.dropRounds ?? null,
      })
    }
    // An accessory whose only footprint is a note (no logged sets) still needs
    // a card — otherwise its note is invisible and unrecoverable from here.
    for (const exId of notesByExercise.keys()) {
      if (!grouped.has(exId)) grouped.set(exId, [])
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
        notes: notesByExercise.get(exId) ?? '',
      })
    }
    setEditAccessories(accessories)

    // The roster is gone — offer the whole non-archived library, alphabetical.
    setLibraryExercises(
      (await db.exercises.toArray())
        .filter(e => !e.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
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

  const updateAccNotes = (accIdx: number, value: string) => {
    setEditAccessories(prev => prev.map((acc, ai) => ai === accIdx ? { ...acc, notes: value } : acc))
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
        notes: '',
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
          // The note described the old exercise specifically — always clear
          // on swap, regardless of whether the type changed.
          notes: '',
        }
      }))
    }
    setPicker(null)
  }

  const wasSwapped = (acc: EditAccessory) =>
    acc.originalExerciseId !== null && acc.originalExerciseId !== acc.exerciseId

  /**
   * Clear out the rows a swapped card is replacing.
   *
   * Split from the write below and run for EVERY card first, because these two
   * halves interfere across cards: a chain of swaps (card A goes B→C while card
   * B goes A→B) has one card's cleanup of its own `originalExerciseId` delete
   * the rows another card has already written for that same exercise. Deleting
   * everything that is going away before anything new is written removes the
   * ordering dependence entirely (F01).
   */
  const clearSwappedAccessory = async (acc: EditAccessory) => {
    if (!wasSwapped(acc)) return
    await db.accessorySets
      .where('sessionId').equals(sid)
      .filter(s => s.exerciseId === acc.originalExerciseId)
      .delete()
    await db.accessoryNotes
      .where('sessionId').equals(sid)
      .filter(n => n.exerciseId === acc.originalExerciseId)
      .delete()
  }

  const persistAccessory = async (acc: EditAccessory) => {
    const swapped = wasSwapped(acc)
    const existing = !swapped && acc.originalExerciseId === acc.exerciseId
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
          weight: s.weight, reps: s.reps, duration: s.duration, distance: s.distance,
          bandLoad: s.bandLoad ?? null,
          dropRounds: s.dropRounds ?? null,
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
        bandLoad: s.bandLoad ?? null,
        reps: s.reps,
        duration: s.duration,
        distance: s.distance,
        dropRounds: s.dropRounds ?? null,
      })))
    }

    const trimmedNotes = acc.notes.trim()
    const existingNote = await db.accessoryNotes
      .where('sessionId').equals(sid)
      .filter(n => n.exerciseId === acc.exerciseId)
      .first()
    if (trimmedNotes === '') {
      if (existingNote?.id != null) await db.accessoryNotes.delete(existingNote.id)
    } else if (existingNote?.id != null) {
      await db.accessoryNotes.update(existingNote.id, { notes: trimmedNotes })
    } else {
      await db.accessoryNotes.add({ sessionId: sid, exerciseId: acc.exerciseId, notes: trimmedNotes })
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await db.transaction(async () => {
        await Promise.all(editSets().map(s =>
          db.sets.update(s.id, { weight: s.weight, reps: s.reps, bandLoad: s.bandLoad ?? null })
        ))
        for (const exId of deletedAccessoryIds()) {
          await db.accessorySets
            .where('sessionId').equals(sid)
            .filter(s => s.exerciseId === exId)
            .delete()
          await db.accessoryNotes
            .where('sessionId').equals(sid)
            .filter(n => n.exerciseId === exId)
            .delete()
        }
        // Two passes, deliberately: every replaced original is removed before
        // any replacement is written, so no card can delete rows another card
        // in this same save has just written (F01).
        for (const acc of editAccessories()) await clearSwappedAccessory(acc)
        for (const acc of editAccessories()) await persistAccessory(acc)
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
                    <SectionLabel class="mb-2">{type.toUpperCase()}</SectionLabel>
                    <Index each={rows()}>
                      {row => (
                        <div class="flex items-center gap-2 py-1.5 flex-wrap">
                          <Show
                            when={row().s.bandLoad}
                            fallback={<><Stepper value={row().s.weight} onChange={v => updateSet(row().i, 'weight', v)} step={2.5} min={0} fieldLabel="weight" /><span class="text-muted text-xs">lb ×</span></>}
                          >
                            <BandLoadControls profile={liftProfiles().get(row().s.liftId ?? liftId()!)} loading={liftLoadings().get(row().s.liftId ?? liftId()!) ?? undefined} value={row().s.bandLoad!}
                              onChange={bandLoad => setEditSets(prev => prev.map((s, i) => i === row().i ? { ...s, bandLoad, weight: effectiveBandLoad(bandLoad) } : s))} />
                            {/* Bare — the band summary already ends in its own "lb". */}
                            <span class="text-muted text-xs">×</span>
                          </Show>
                          <Stepper value={row().s.reps} onChange={v => updateSet(row().i, 'reps', v)} step={1} min={0} fieldLabel="reps" />
                          <Show when={row().s.isAmrap}>
                            <span class="text-warn text-xs tracking-widest">AMRAP</span>
                          </Show>
                          {/* Which movement this cross set trained. Without it
                              two blocks are indistinguishable in this list. */}
                          <Show when={row().s.type === 'cross' && row().s.liftId != null}>
                            <span class="text-muted text-xs tracking-widest uppercase">
                              {liftNames().get(row().s.liftId!) ?? `Lift ${row().s.liftId}`}
                            </span>
                          </Show>
                        </div>
                      )}
                    </Index>
                  </div>
                </Show>
              )
            }}
          </For>

          <div class="mb-6">
            <Rule label="ACCESSORIES" class="text-muted mb-2" />
            <Index each={editAccessories()}>
              {(accAcc, ai) => (
                <div class="border border-border p-3 mb-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="text-text text-sm uppercase tracking-widest">{accAcc().exerciseName}</span>
                      <button
                        onClick={() => setPicker({ kind: 'swap', accIdx: ai })}
                        aria-label={`Swap ${accAcc().exerciseName}`}
                        class="text-muted text-xs hover:text-accent"
                      >
                        swap
                      </button>
                    </div>
                    <button
                      onClick={() => deleteAccessory(ai)}
                      aria-label={`Remove ${accAcc().exerciseName}`}
                      class="text-muted hover:text-danger text-xs font-mono px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <Index each={accAcc().sets}>
                    {(setRow, si) => (
                      <div class="flex items-center flex-wrap gap-2 py-1 pl-2">
                        <span class="text-muted text-xs w-10">Set {setRow().setNumber}</span>
                        <Show when={accAcc().exerciseType === 'reps'}>
                          <>
                            <Show
                              when={setRow().bandLoad}
                              fallback={<><Stepper value={setRow().weight ?? 0} onChange={v => updateAccSet(ai, si, 'weight', v)} step={2.5} min={0} fieldLabel="weight" /><span class="text-muted text-xs">lb ×</span></>}
                            >
                              <BandLoadControls profile={exerciseProfiles().get(accAcc().exerciseId)} loading={exerciseLoadings().get(accAcc().exerciseId) ?? undefined} value={setRow().bandLoad!}
                                onChange={bandLoad => setEditAccessories(prev => prev.map((acc, idx) => idx === ai ? { ...acc, sets: acc.sets.map((s, n) => n === si ? { ...s, bandLoad, weight: effectiveBandLoad(bandLoad) } : s) } : acc))} />
                              {/* Bare — the band summary already ends in its own "lb". */}
                              <span class="text-muted text-xs">×</span>
                            </Show>
                            <Stepper value={setRow().reps ?? 0} onChange={v => updateAccSet(ai, si, 'reps', v)} step={1} min={0} fieldLabel="reps" />
                            <div class="w-full">
                              <DropRoundsEditor
                                profile={exerciseProfiles().get(accAcc().exerciseId)}
                                loading={exerciseLoadings().get(accAcc().exerciseId) ?? undefined}
                                bandLoad={setRow().bandLoad}
                                rounds={setRow().dropRounds ?? []}
                                weight={setRow().weight ?? 0}
                                reps={setRow().reps ?? 0}
                                onChange={rounds => setEditAccessories(prev => prev.map((acc, idx) => idx === ai
                                  ? { ...acc, sets: acc.sets.map((s, n) => n === si ? { ...s, dropRounds: rounds } : s) }
                                  : acc))}
                              />
                            </div>
                          </>
                        </Show>
                        <Show when={accAcc().exerciseType === 'timed'}>
                          <>
                            <Show
                              when={setRow().bandLoad}
                              fallback={<><Stepper value={setRow().weight ?? 0} onChange={v => updateAccSet(ai, si, 'weight', v)} step={2.5} min={0} fieldLabel="weight" /><span class="text-muted text-xs">lb ×</span></>}
                            >
                              <BandLoadControls profile={exerciseProfiles().get(accAcc().exerciseId)} loading={exerciseLoadings().get(accAcc().exerciseId) ?? undefined} value={setRow().bandLoad!}
                                onChange={bandLoad => setEditAccessories(prev => prev.map((acc, idx) => idx === ai ? { ...acc, sets: acc.sets.map((s, n) => n === si ? { ...s, bandLoad, weight: effectiveBandLoad(bandLoad) } : s) } : acc))} />
                              {/* Bare — the band summary already ends in its own "lb". */}
                              <span class="text-muted text-xs">×</span>
                            </Show>
                            <DurationInput
                              value={setRow().duration}
                              onChange={val => updateAccSet(ai, si, 'duration', val)}
                              fieldLabel={`set ${si + 1}`}
                            />
                          </>
                        </Show>
                        <Show when={accAcc().exerciseType === 'distance'}>
                          <>
                            <Show
                              when={setRow().bandLoad}
                              fallback={<><Stepper value={setRow().weight ?? 0} onChange={v => updateAccSet(ai, si, 'weight', v)} step={2.5} min={0} fieldLabel="weight" /><span class="text-muted text-xs">lb ×</span></>}
                            >
                              <BandLoadControls profile={exerciseProfiles().get(accAcc().exerciseId)} loading={exerciseLoadings().get(accAcc().exerciseId) ?? undefined} value={setRow().bandLoad!}
                                onChange={bandLoad => setEditAccessories(prev => prev.map((acc, idx) => idx === ai ? { ...acc, sets: acc.sets.map((s, n) => n === si ? { ...s, bandLoad, weight: effectiveBandLoad(bandLoad) } : s) } : acc))} />
                              {/* Bare — the band summary already ends in its own "lb". */}
                              <span class="text-muted text-xs">×</span>
                            </Show>
                            <Stepper value={setRow().distance ?? 0} onChange={v => updateAccSet(ai, si, 'distance', v)} step={1} min={0} fieldLabel="distance" />
                          </>
                        </Show>
                      </div>
                    )}
                  </Index>
                  <NotesField
                    value={accAcc().notes}
                    onInput={v => updateAccNotes(ai, v)}
                    rows={2}
                    placeholder="e.g. switched grip after set 3…"
                    class="mt-2"
                    textareaClass="w-full bg-surface border border-border text-text font-mono px-2 py-2 text-xs focus:outline-none focus:border-accent resize-none"
                  />
                </div>
              )}
            </Index>
            <button
              onClick={() => setPicker({ kind: 'add' })}
              class="w-full border border-border py-2 text-muted text-xs tracking-widest hover:border-accent hover:text-accent"
            >
              + ADD ACCESSORY
            </button>
          </div>

          <div class="mb-6">
            <SectionLabel class="mb-2">NOTES</SectionLabel>
            <NotesField
              value={notes()}
              onInput={setNotes}
              rows={3}
              placeholder="session notes..."
              textareaClass="w-full bg-surface border border-border text-text font-mono px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none"
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
            <Modal
              variant="sheet"
              title="SELECT EXERCISE"
              onClose={() => setPicker(null)}
              class="px-4 pb-4 overflow-y-auto"
            >
              <div class="space-y-1">
                <For each={libraryExercises()}>
                  {(exercise) => {
                    // Guard swap too: swapping onto an exercise that already has
                    // a card would duplicate its set rows and clobber its note.
                    const alreadyAdded = editAccessories().some(a => a.exerciseId === exercise.id)
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
                        {/* uppercase, same as AccessoryPicker rows and the logged accessory header */}
                        <span class="uppercase tracking-widest">{exercise.name}{alreadyAdded ? ' ✓' : ''}</span>
                        <span class="text-muted text-xs uppercase">{exercise.type}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </Modal>
          </Show>
        </div>
      )}
    </Show>
  )
}

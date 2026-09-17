import { createSignal, Index, Show } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { db } from '../db/index'
import type { PtDistanceUnit, PtMeasure, PtResistanceKind } from '../types/domain'
import {
  archivePtRoutine,
  formatPtPrescription,
  getPtRoutine,
  savePtRoutine,
  PT_DISTANCE_UNITS,
  PT_MEASURES,
  PT_MEASURE_LABEL,
  PT_RESISTANCE_KINDS,
  PT_RESISTANCE_LABEL,
  type PtExerciseDraft,
} from '../lib/pt'
import { createAsyncRead } from '../lib/async-read'
import { useConfirmation } from '../hooks/use-confirmation'
import { useSingleFlight } from '../hooks/use-single-flight'
import { showToast } from '../store/toast-store'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import SubLabel from '../components/layout/SubLabel'
import Stepper from '../components/forms/Stepper'
import DurationInput from '../components/forms/DurationInput'
import ToggleChip from '../components/ui/ToggleChip'
import InlineConfirm from '../components/ui/InlineConfirm'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

const INPUT_CLASS = 'w-full bg-surface border border-border text-text px-2 py-1 text-sm focus:outline-none focus:border-accent'

const emptyDraft = (): PtExerciseDraft => ({
  name: '',
  description: '',
  videoUrl: '',
  sets: 3,
  measure: 'reps',
  targetReps: 10,
  targetSeconds: 30,
  targetDistance: 25,
  distanceUnit: 'yd',
  resistanceKind: 'none',
  // A real number, not null: the stepper below renders `resistanceWeight ?? 10`,
  // so a null draft showed 10 on screen while validation rejected the save as
  // "must be more than 0" — an error about a value the user could see was fine.
  // Every branch of the draft carries a usable value; validatePtExercise is
  // what nulls the ones the chosen kind does not use.
  resistanceWeight: 10,
  resistanceBand: '',
})

/**
 * Build or edit a PT routine.
 *
 * The whole form is a draft: nothing reaches the database until DONE, which
 * writes the routine and its full exercise list in one transaction. Leaving
 * early — CANCEL, the back gesture, a killed tab — leaves the database exactly
 * as it was, so a new routine cannot exist half-built and an edit cannot be
 * half-applied.
 *
 * The drafts keep every target field populated regardless of the selected
 * measure (a reps exercise still carries `targetSeconds: 30`), so toggling
 * between measures does not wipe what the user typed under the other one.
 * `validatePtExercise` is what nulls the irrelevant columns on the way out.
 */
export default function PtRoutineEdit() {
  const params = useParams<{ routineId?: string }>()
  const navigate = useNavigate()
  const { confirm } = useConfirmation()

  const routineId = (): number | null => {
    const raw = params.routineId
    if (raw == null) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) ? parsed : null
  }
  const isNew = () => routineId() === null

  const [name, setName] = createSignal('')
  const [notes, setNotes] = createSignal('')
  const [drafts, setDrafts] = createSignal<PtExerciseDraft[]>([])
  const [openIndex, setOpenIndex] = createSignal<number | null>(null)

  const read = createAsyncRead()

  const load = async (isCurrent: () => boolean) => {
    const id = routineId()
    if (id === null) {
      if (!isCurrent()) return
      setDrafts([emptyDraft()])
      setOpenIndex(0)
      return
    }
    const detail = await getPtRoutine(db, id)
    if (!isCurrent()) return
    if (!detail) {
      showToast('That routine no longer exists.')
      navigate('/pt', { replace: true })
      return
    }
    setName(detail.routine.name)
    setNotes(detail.routine.notes ?? '')
    setDrafts(detail.exercises.map(ex => ({
      id: ex.id,
      name: ex.name,
      description: ex.description ?? '',
      videoUrl: ex.videoUrl ?? '',
      sets: ex.sets,
      measure: ex.measure,
      // Falling back to the empty draft's values, not to null: an exercise
      // stored as reps has no seconds, and a stepper needs a number to open on
      // if the user switches it to time.
      targetReps: ex.targetReps ?? 10,
      targetSeconds: ex.targetSeconds ?? 30,
      targetDistance: ex.targetDistance ?? 25,
      distanceUnit: ex.distanceUnit ?? 'yd',
      resistanceKind: ex.resistanceKind,
      resistanceWeight: ex.resistanceWeight ?? 10,
      resistanceBand: ex.resistanceBand ?? '',
    })))
  }

  void read.run(load)

  const patch = (index: number, changes: Partial<PtExerciseDraft>) => {
    setDrafts(prev => prev.map((d, i) => i === index ? { ...d, ...changes } : d))
  }

  const addExercise = () => {
    setDrafts(prev => [...prev, emptyDraft()])
    setOpenIndex(drafts().length - 1)
  }

  const removeExercise = (index: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== index))
    setOpenIndex(null)
  }

  const move = (index: number, delta: number) => {
    const next = index + delta
    setDrafts(prev => {
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      const [row] = copy.splice(index, 1)
      copy.splice(next, 0, row)
      return copy
    })
    // Follow the row that moved, so the open card stays the one being edited.
    if (openIndex() === index) setOpenIndex(next)
    else if (openIndex() === next) setOpenIndex(index)
  }

  const { busy: saving, guard } = useSingleFlight()
  const handleSave = guard(async () => {
    try {
      await savePtRoutine(db, {
        id: routineId() ?? undefined,
        name: name(),
        notes: notes(),
        exercises: drafts(),
      })
      showToast(isNew() ? 'Routine created.' : 'Routine saved.')
      navigate('/pt')
    } catch (err) {
      // Validation errors are the common case and name the offending exercise,
      // so the message is shown as-is rather than wrapped in a generic prefix.
      showToast(message(err))
    }
  })

  // Archive, not delete: deleting a routine takes every run of it, and the
  // record of having done the rehab is usually the part worth keeping. Lives
  // here rather than on the list row, which already carries START/EDIT/delete
  // and wraps on a phone with a fourth control.
  const handleArchive = guard(async () => {
    const id = routineId()
    if (id === null) return
    if (!await confirm(
      `Archive ${name().trim() || 'this routine'}? It leaves the start list; its history is kept.`,
      { confirmLabel: 'ARCHIVE' },
    )) return
    try {
      await archivePtRoutine(db, id)
      showToast('Routine archived.')
      navigate('/pt')
    } catch (err) {
      showToast(`Could not archive that routine: ${message(err)}`)
    }
  })

  return (
    <Show
      when={!read.error()}
      fallback={
        <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
          <div role="alert" class="border border-danger px-3 py-2">
            <div class="text-danger text-xs uppercase tracking-widest mb-1">Could not load routine</div>
            <div class="text-text-dim text-sm mb-2 break-words">{read.error()}</div>
            <button
              onClick={() => void read.retry()}
              class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase"
            >
              RETRY
            </button>
          </div>
        </div>
      }
    >
      <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
        <Rule label={isNew() ? 'NEW PT ROUTINE' : 'EDIT PT ROUTINE'} class="text-muted mb-4" />

        <div class="mb-4">
          <SectionLabel class="mb-1">NAME</SectionLabel>
          <input
            type="text"
            value={name()}
            onInput={e => setName(e.currentTarget.value)}
            placeholder="Shoulder rehab"
            aria-label="Routine name"
            class={INPUT_CLASS}
          />
        </div>

        <div class="mb-6">
          <SectionLabel class="mb-1">NOTES</SectionLabel>
          <textarea
            value={notes()}
            onInput={e => setNotes(e.currentTarget.value)}
            rows={2}
            placeholder="From the clinic, 3x/week"
            aria-label="Routine notes"
            class={INPUT_CLASS}
          />
        </div>

        <Rule label="EXERCISES" class="text-muted mb-3" />

        <Index each={drafts()}>
          {(draft, index) => (
            <div class="border border-border mb-2">
              <div class="flex items-center justify-between gap-2 px-3 py-2">
                <button
                  onClick={() => setOpenIndex(openIndex() === index ? null : index)}
                  aria-expanded={openIndex() === index}
                  class="flex-1 text-left min-w-0"
                >
                  <div class="text-text text-sm uppercase tracking-widest truncate">
                    {draft().name.trim() === '' ? `EXERCISE ${index + 1}` : draft().name}
                  </div>
                  <div class="text-faint text-xs">{formatPtPrescription(draft())}</div>
                </button>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${draft().name || `exercise ${index + 1}`} up`}
                    class="text-muted hover:text-accent text-xs px-1 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === drafts().length - 1}
                    aria-label={`Move ${draft().name || `exercise ${index + 1}`} down`}
                    class="text-muted hover:text-accent text-xs px-1 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <InlineConfirm
                    label="✕"
                    ariaLabel={`Remove ${draft().name || `exercise ${index + 1}`}`}
                    confirmText="remove?"
                    onConfirm={() => removeExercise(index)}
                  />
                </div>
              </div>

              <Show when={openIndex() === index}>
                <div class="border-t border-border px-3 py-3 space-y-3">
                  <div>
                    <SubLabel class="mb-1">NAME</SubLabel>
                    <input
                      type="text"
                      value={draft().name}
                      onInput={e => patch(index, { name: e.currentTarget.value })}
                      placeholder="Band pull-apart"
                      aria-label={`Exercise ${index + 1} name`}
                      class={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    <SubLabel class="mb-1">DESCRIPTION</SubLabel>
                    <textarea
                      value={draft().description ?? ''}
                      onInput={e => patch(index, { description: e.currentTarget.value })}
                      rows={2}
                      placeholder="Elbows locked, squeeze the shoulder blades"
                      aria-label={`Exercise ${index + 1} description`}
                      class={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    <SubLabel class="mb-1">VIDEO LINK</SubLabel>
                    <input
                      type="url"
                      inputmode="url"
                      value={draft().videoUrl ?? ''}
                      onInput={e => patch(index, { videoUrl: e.currentTarget.value })}
                      placeholder="https://…"
                      aria-label={`Exercise ${index + 1} video link`}
                      class={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    <SubLabel class="mb-1">SETS</SubLabel>
                    <Stepper
                      value={draft().sets}
                      onChange={v => patch(index, { sets: v })}
                      step={1}
                      min={1}
                      max={99}
                      fieldLabel={`exercise ${index + 1} sets`}
                    />
                  </div>

                  <div>
                    <SubLabel class="mb-1">EACH SET IS</SubLabel>
                    <div class="flex gap-2 mb-2">
                      <Index each={PT_MEASURES}>
                        {measure => (
                          <ToggleChip
                            active={draft().measure === measure()}
                            onClick={() => patch(index, { measure: measure() as PtMeasure })}
                            class="flex-1"
                          >
                            {PT_MEASURE_LABEL[measure()]}
                          </ToggleChip>
                        )}
                      </Index>
                    </div>

                    <Show when={draft().measure === 'reps'}>
                      <Stepper
                        value={draft().targetReps ?? 10}
                        onChange={v => patch(index, { targetReps: v })}
                        step={1}
                        min={1}
                        fieldLabel={`exercise ${index + 1} reps`}
                      />
                    </Show>
                    <Show when={draft().measure === 'time'}>
                      <DurationInput
                        value={draft().targetSeconds ?? 30}
                        onChange={v => patch(index, { targetSeconds: v })}
                        fieldLabel={`exercise ${index + 1} hold`}
                      />
                    </Show>
                    <Show when={draft().measure === 'distance'}>
                      <div class="flex items-center gap-2 flex-wrap">
                        <Stepper
                          value={draft().targetDistance ?? 25}
                          onChange={v => patch(index, { targetDistance: v })}
                          step={5}
                          min={1}
                          fieldLabel={`exercise ${index + 1} distance`}
                        />
                        <Index each={PT_DISTANCE_UNITS}>
                          {unit => (
                            <ToggleChip
                              active={(draft().distanceUnit ?? 'yd') === unit()}
                              onClick={() => patch(index, { distanceUnit: unit() as PtDistanceUnit })}
                            >
                              {unit()}
                            </ToggleChip>
                          )}
                        </Index>
                      </div>
                    </Show>
                  </div>

                  <div>
                    <SubLabel class="mb-1">RESISTANCE</SubLabel>
                    <div class="flex gap-2 mb-2">
                      <Index each={PT_RESISTANCE_KINDS}>
                        {kind => (
                          <ToggleChip
                            active={draft().resistanceKind === kind()}
                            onClick={() => patch(index, { resistanceKind: kind() as PtResistanceKind })}
                            class="flex-1"
                          >
                            {PT_RESISTANCE_LABEL[kind()]}
                          </ToggleChip>
                        )}
                      </Index>
                    </div>

                    <Show when={draft().resistanceKind === 'weight'}>
                      <Stepper
                        value={draft().resistanceWeight ?? 10}
                        onChange={v => patch(index, { resistanceWeight: v })}
                        step={5}
                        min={1}
                        fieldLabel={`exercise ${index + 1} resistance weight`}
                      />
                    </Show>
                    <Show when={draft().resistanceKind === 'band'}>
                      <input
                        type="text"
                        value={draft().resistanceBand ?? ''}
                        onInput={e => patch(index, { resistanceBand: e.currentTarget.value })}
                        placeholder="red"
                        aria-label={`Exercise ${index + 1} band`}
                        class={INPUT_CLASS}
                      />
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </Index>

        <button
          onClick={addExercise}
          class="w-full border border-border text-muted hover:border-accent hover:text-accent px-4 py-2 text-xs tracking-widest uppercase mb-6"
        >
          + ADD EXERCISE
        </button>

        <Show when={!isNew()}>
          <button
            onClick={() => void handleArchive()}
            disabled={saving()}
            class="w-full border border-border text-muted hover:border-warn hover:text-warn px-4 py-2 text-xs tracking-widest uppercase mb-6 disabled:opacity-40"
          >
            ARCHIVE ROUTINE
          </button>
        </Show>

        <div class="flex gap-2">
          <button
            onClick={() => navigate('/pt')}
            class="flex-1 border border-border text-muted hover:text-text px-4 py-3 text-xs tracking-widest uppercase"
          >
            CANCEL
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving()}
            class="flex-1 border border-accent text-accent px-4 py-3 text-xs tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed"
          >
            DONE
          </button>
        </div>
      </div>
    </Show>
  )
}

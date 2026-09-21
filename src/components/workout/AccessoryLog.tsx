import BandLoadControls from '../forms/BandLoadControls'
import BandSettings from '../forms/BandSettings'
import { bandProfileFor, effectiveBandLoad, makeBandLoad, suggestBandLoad } from '../../lib/band-loading'
import { createSignal, createMemo, createEffect, on, createUniqueId, For, Show } from 'solid-js'
import { logAccessorySet, editAccessorySet, deleteLastAccessorySet, removeAccessory, startRest, setAccessoryNotes, type ActiveAccessory } from '../../store/workout-store'
import type { AccessorySet, Exercise, DropRound, BandLoad, BandProfile } from '../../types/domain'
import { ACCESSORY_SETS, ACCESSORY_REPS, restTypeAfterSet } from '../../lib/calc'
import DurationInput from '../forms/DurationInput'
import Stepper from '../forms/Stepper'
import SetLogControls, { FieldRow } from '../forms/SetLogControls'
import SetReadout from '../forms/SetReadout'
import NotesField from '../forms/NotesField'
import PlateDisplay from '../forms/PlateDisplay'
import { settings } from '../../store/settings-store'
import { resolveExerciseLoading } from '../../lib/plate-loading'
import { accessorySetValue } from '../../lib/format'

import DropRoundsEditor from '../forms/DropRoundsEditor'
import FoldGlyph from '../ui/FoldGlyph'

import InlineConfirm from '../ui/InlineConfirm'

interface Props {
  accessory: ActiveAccessory
  exercise: Exercise | undefined
  onExerciseClick?: (exerciseId: number) => void
  // Band settings save to the exercise ROW, which the parent holds a copy of
  // and does not refetch. Kept as a local override instead, the save was
  // invisible to every other logger on the same exercise until a reload, so
  // the two disagreed about whether bands were even on. The parent owns the
  // list; this hands the new profile back to it.
  onBandProfileSaved?: (profile: BandProfile) => void
}

export default function AccessoryLog(props: Props) {
  const entity = () => props.exercise
  const profile = createMemo(() => bandProfileFor(entity()))
  const [bandLoad, setBandLoad] = createSignal<BandLoad | null>(null)
  const [editBandLoad, setEditBandLoad] = createSignal<BandLoad | null>(null)
  const type = () => props.exercise?.type ?? 'reps'
  const loading = () => (props.exercise ? resolveExerciseLoading(props.exercise, settings.barWeight) : null)
  const nextSet = createMemo(() => props.accessory.loggedSets.length + 1)
  const [addingExtra, setAddingExtra] = createSignal(false)
  const done = createMemo(() => props.accessory.loggedSets.length >= ACCESSORY_SETS && !addingExtra())

  const [userExpanded, setUserExpanded] = createSignal(false)
  const contentId = createUniqueId()
  const expanded = () => !done() || userExpanded()
  createEffect(on(done, complete => { if (complete) setUserExpanded(false) }, { defer: true }))
  const [dropRounds, setDropRounds] = createSignal<DropRound[]>([])
  const [editDropRounds, setEditDropRounds] = createSignal<DropRound[]>([])

  const initWeight = () => {
    const last = props.accessory.loggedSets[props.accessory.loggedSets.length - 1]
    return last?.weight ?? props.accessory.calculatedWeight ?? 0
  }

  const [weight, setWeight] = createSignal(initWeight())
  const changeBandLoad = (load: BandLoad) => { setBandLoad(load); setWeight(effectiveBandLoad(load)) }
  const suggest = (target: number) => { if (profile()) changeBandLoad(suggestBandLoad(profile()!, target, settings.plates)) }
  createEffect(on(profile, (p, previous) => {
    if (!p) {
      // Bands off. `weight` only ever moves through `changeBandLoad` here, so
      // nothing else would ever take it off the last effective load — the
      // stepper came back reading 148.5 against a prescribed 150 and stayed
      // there. Back to where `initWeight` would have put it: the last logged
      // set, or the prescription.
      if (previous) setWeight(initWeight())
      setBandLoad(null); return
    }
    const last = props.accessory.loggedSets.at(-1)?.bandLoad
    const current = bandLoad() ?? last
    if (current) changeBandLoad(makeBandLoad(p, current.band, current.addedWeight))
    else suggest(props.accessory.calculatedWeight)
  }))
  const [reps, setReps] = createSignal(ACCESSORY_REPS)
  const [duration, setDuration] = createSignal<number | null>(null)
  const [distance, setDistance] = createSignal(0)
  const [noteOpen, setNoteOpen] = createSignal(false)
  // Live value for the active-set headline, mirroring the stepper being edited.
  const activeValue = () =>
    type() === 'reps' ? `${reps()}`
      : type() === 'timed' ? (duration() != null ? `${duration()}s` : '')
      : `${distance()}ft`
  const [editingSetIdx, setEditingSetIdx] = createSignal<number | null>(null)
  const [editWeight, setEditWeight] = createSignal(0)
  const [editReps, setEditReps] = createSignal(0)
  const [editDuration, setEditDuration] = createSignal<number | null>(null)
  const [editDistance, setEditDistance] = createSignal(0)
  const startEditSet = (i: number) => {
    const s = props.accessory.loggedSets[i]
    setEditBandLoad(s.bandLoad ? { ...s.bandLoad } : null)
    setEditDropRounds(s.dropRounds?.map(r => ({ ...r, bandLoad: r.bandLoad ? { ...r.bandLoad } : null })) ?? [])
    setEditWeight(s.weight ?? 0)
    setEditReps(s.reps ?? 10)
    setEditDuration(s.duration ?? null)
    setEditDistance(s.distance ?? 0)
    setEditingSetIdx(i)
  }

  const saveEditSet = (i: number) => {
    editAccessorySet(props.accessory.exerciseId, i, {
      weight: editWeight(),
      bandLoad: editBandLoad(),
      dropRounds: type() === 'reps' ? editDropRounds() : null,
      reps: type() === 'reps' ? editReps() : null,
      duration: type() === 'timed' ? editDuration() : null,
      distance: type() === 'distance' ? editDistance() : null,
    })
    setEditingSetIdx(null)
  }

  // Logging changes no program state. A weight the user dialled in stands as
  // what they lifted; whether it should become the new training max is asked
  // once, at the end of the session (see lib/accessory-tm.ts) — the same way
  // main lifts handle it.
  const handleLog = () => {
    const set: Partial<AccessorySet> = {
      exerciseId: props.accessory.exerciseId,
      setNumber: nextSet(),
      weight: weight(),
      bandLoad: bandLoad(),
      dropRounds: type() === 'reps' ? dropRounds() : null,
      reps: type() === 'reps' ? reps() : null,
      duration: type() === 'timed' ? duration() : null,
      distance: type() === 'distance' ? distance() : null,
    }
    logAccessorySet(props.accessory.exerciseId, set)
    startRest(type() === 'reps' ? restTypeAfterSet(reps(), ACCESSORY_REPS) : 'normal')
    setDropRounds([])
    setReps(ACCESSORY_REPS)
    setDuration(null)
    setDistance(0)
  }

  return (
    <div class="border border-border p-3 mb-3">
      <div class="text-text text-sm mb-1 uppercase tracking-widest flex items-center">
        {/* Real <button>, not a span with role="button": keyboard support comes
            free and it matches the other two history tap targets (Workout
            header, CollapsibleSection label). */}
        <Show
          when={props.onExerciseClick}
          fallback={
            <span class="flex-1">
              <span>{props.accessory.exerciseName}</span>
              <span class="text-muted ml-2 text-xs">{ACCESSORY_SETS}x{ACCESSORY_REPS} @</span>
              <span class="text-muted text-xs font-mono ml-1">{weight()}lb</span>
            </span>
          }
        >
          <button
            // uppercase must be explicit here: preflight sets button
            // { text-transform: none }, which beats inheriting it from the row.
            class="flex-1 text-left cursor-pointer uppercase hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => props.onExerciseClick!(props.accessory.exerciseId)}
            aria-label={`View history for ${props.accessory.exerciseName}`}
          >
            <span class="underline underline-offset-2 decoration-faint hover:decoration-accent">
              {props.accessory.exerciseName}
            </span>
            <span class="text-muted ml-2 text-xs">{ACCESSORY_SETS}x{ACCESSORY_REPS} @</span>
            <span class="text-muted text-xs font-mono ml-1">{weight()}lb</span>
          </button>
        </Show>
        {/* The same gate, and it matters more here: a session logs several
            accessories and every one of them carried this. Settings reaches an
            exercise's profile exactly as it reaches a lift's. */}
        <Show when={bandProfileFor(entity())}>
          <BandSettings entity={entity()!} kind="exercise" onSaved={props.onBandProfileSaved} />
        </Show>
        <Show when={done()}>
          <button type="button" aria-expanded={expanded()} aria-controls={contentId}
            aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${props.accessory.exerciseName}`}
            onClick={() => setUserExpanded(v => !v)} class="flex items-center gap-2 ml-2 text-accent text-xs">
            Complete <FoldGlyph expanded={expanded()} />
          </button>
        </Show>
        <InlineConfirm
          label="✕"
          ariaLabel={`Remove ${props.accessory.exerciseName}`}
          confirmText="remove?"
          onConfirm={() => removeAccessory(props.accessory.exerciseId)}
          class="ml-2"
          strong
        />
      </div>
      <div id={contentId} hidden={!expanded()}>
        <Show
          when={noteOpen()}
          fallback={
            <button
              onClick={() => setNoteOpen(true)}
              class={props.accessory.notes?.trim()
                ? 'block w-full text-left pl-2 mb-1 text-faint text-xs font-mono hover:text-accent truncate'
                : 'block pl-2 mb-1 text-faint text-xs font-mono hover:text-accent tracking-widest'}
            >
              {props.accessory.notes?.trim() || '+ NOTE'}
            </button>
          }
        >
          <div class="pl-2 mb-2">
            <NotesField
              value={props.accessory.notes ?? ''}
              onInput={v => setAccessoryNotes(props.accessory.exerciseId, v)}
              rows={2}
              placeholder="e.g. switched grip after set 3…"
              textareaClass="w-full bg-surface border border-border text-text font-mono px-2 py-2 text-xs focus:outline-none focus:border-accent resize-none"
            />
            <button
              onClick={() => setNoteOpen(false)}
              class="text-muted text-xs mt-0.5"
            >
              done
            </button>
          </div>
        </Show>
        <For each={props.accessory.loggedSets}>
          {(s, i) => {
            const isLast = () => i() === props.accessory.loggedSets.length - 1
            return (
              <Show
                when={editingSetIdx() === i()}
                fallback={
                  <>
                    <SetReadout
                      bandLoad={s.bandLoad}
                      weight={s.weight}
                      value={accessorySetValue(s)}
                      leading={<span class="text-muted">Set {i() + 1}:</span>}
                      onClick={() => startEditSet(i())}
                      class="pl-2 py-0.5"
                      badges={<span class="text-accent ml-1">done</span>}
                      trailing={
                        <Show when={isLast()}>
                          <InlineConfirm
                            label="undo"
                            ariaLabel={`Undo last ${props.accessory.exerciseName} set`}
                            confirmText="undo set?"
                            onConfirm={() => deleteLastAccessorySet(props.accessory.exerciseId)}
                            class="ml-auto"
                          />
                        </Show>
                      }
                    />
                    <For each={s.dropRounds ?? []}>
                      {(round, n) => <SetReadout bandLoad={round.bandLoad} weight={round.weight} value={String(round.reps)} leading={<span>Drop {n() + 1}</span>} class="pl-4" />}
                    </For>
                  </>
                }
              >
                <div class="flex items-center gap-2 pl-2 py-1 flex-wrap">
                  <span class="text-warn text-xs">Set {i() + 1}:</span>
                  <Show
                    when={editBandLoad()}
                    fallback={<><Stepper value={editWeight()} onChange={setEditWeight} step={2.5} min={0} fieldLabel="weight" /><span class="text-muted text-xs">lb ×</span></>}
                  >
                    <BandLoadControls profile={profile()} loading={loading() ?? undefined} value={editBandLoad()!}
                      target={props.accessory.calculatedWeight}
                      onSuggest={target => {
                        if (!profile()) return
                        const load = suggestBandLoad(profile()!, target, settings.plates)
                        setEditBandLoad(load); setEditWeight(effectiveBandLoad(load))
                      }}
                      onChange={load => { setEditBandLoad(load); setEditWeight(effectiveBandLoad(load)) }} />
                    {/* Bare — the band summary already ends in its own "lb". */}
                    <span class="text-muted text-xs">×</span>
                  </Show>
                  <Show when={type() === 'reps'}>
                    <Stepper value={editReps()} onChange={setEditReps} step={1} min={0} fieldLabel="reps" />
                  </Show>
                  <Show when={type() === 'timed'}>
                    {/* Both duration inputs are on screen at once in the
                        ordinary case — editing a logged set renders this one
                        while the active-set form renders the other — so without
                        fieldLabel a screen reader hears two identical "Increase
                        minutes" buttons (F59). */}
                    <DurationInput
                      value={editDuration()} onChange={setEditDuration}
                      fieldLabel={`set ${i() + 1}`}
                    />
                  </Show>
                  <Show when={type() === 'distance'}>
                    <Stepper value={editDistance()} onChange={setEditDistance} step={1} min={0} fieldLabel="distance" />
                  </Show>
                  <Show when={type() === 'reps'}>
                    <DropRoundsEditor profile={profile()} loading={loading() ?? undefined} bandLoad={editBandLoad()} rounds={editDropRounds()} onChange={setEditDropRounds} weight={editWeight()} reps={editReps()} />
                  </Show>
                  <button onClick={() => saveEditSet(i())} class="border border-accent text-accent px-2 py-0.5 font-mono text-xs">SAVE</button>
                  <button onClick={() => setEditingSetIdx(null)} class="text-muted text-xs">cancel</button>
                </div>
              </Show>
            )
          }}
        </For>
        {/* `props.exercise` decides whether this logs reps, time or distance.
            It is looked up from Workout's `exercises()`, which is filled on the
            LAST await of its load, while `workout.activeAccessories` is hydrated
            synchronously from localStorage — so after a reload mid-session the
            accessory renders first. type() falls back to 'reps', and logging in
            that window wrote `reps: n, duration: null` for a timed exercise.
            Offer nothing until the type is known rather than guess it (F56). */}
        <Show when={!done() && props.exercise}>
          <div class="mt-2 pl-2">
            <SetReadout
              weight={weight()}
              value={activeValue()}
              leading={<span class="text-warn">Set {nextSet()}</span>}
            />
            <Show when={loading() && !profile() && weight() >= 0}>
              <PlateDisplay weight={weight()} loading={loading()!} />
            </Show>
            <SetLogControls
              weight={weight()}
              weightControls={bandLoad() ? <BandLoadControls target={props.accessory.calculatedWeight} profile={profile()} loading={loading() ?? undefined} value={bandLoad()!} onChange={changeBandLoad} onSuggest={suggest} /> : undefined}
              onWeightChange={setWeight}
              onLog={() => { handleLog(); setAddingExtra(false) }}
            >
              <Show when={type() === 'reps'}>
                <FieldRow label="reps">
                  <Stepper value={reps()} onChange={setReps} step={1} min={0} fieldLabel="reps" />
                </FieldRow>
                <DropRoundsEditor profile={profile()} loading={loading() ?? undefined} bandLoad={bandLoad()} rounds={dropRounds()} onChange={setDropRounds} weight={weight()} reps={reps()} />
              </Show>
              <Show when={type() === 'timed'}>
                <FieldRow label="time">
                  <DurationInput value={duration()} onChange={setDuration} fieldLabel="this set" />
                </FieldRow>
              </Show>
              <Show when={type() === 'distance'}>
                <FieldRow label="dist">
                  <Stepper value={distance()} onChange={setDistance} step={1} min={0} fieldLabel="distance" />
                </FieldRow>
              </Show>
            </SetLogControls>
            <Show when={type() === 'reps'}><p class="text-faint text-xs mt-2">Log after all drop rounds.</p></Show>
          </div>
        </Show>
        <Show when={props.accessory.loggedSets.length >= ACCESSORY_SETS && !addingExtra()}>
          <button
            onClick={() => setAddingExtra(true)}
            class="w-full text-left pl-2 mt-1 text-faint text-xs font-mono hover:text-accent tracking-widest"
          >
            + ADD SET
          </button>
        </Show>
      </div>
    </div>
  )
}

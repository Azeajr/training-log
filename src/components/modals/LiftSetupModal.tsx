import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../../db/index'
import type { Lift, Exercise, LiftAccessory, LiftSupplemental } from '../../types/domain'
import { createExercise, addExerciseToLift, removeExerciseFromLift } from '../../lib/exercise'
import { addLiftSupplemental, updateLiftSupplemental, removeLiftSupplemental } from '../../lib/lift'
import Rule from '../layout/Rule'
import Stepper from '../forms/Stepper'

interface Props {
  liftId: number
  onClose: () => void
}

export default function LiftSetupModal(props: Props) {
  const [lift, setLift] = createSignal<Lift | null>(null)
  const [accessories, setAccessories] = createSignal<LiftAccessory[]>([])
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [blocks, setBlocks] = createSignal<LiftSupplemental[]>([])
  const [activeLifts, setActiveLifts] = createSignal<Lift[]>([])

  const [pickExId, setPickExId] = createSignal<number | null>(null)
  const [newExName, setNewExName] = createSignal('')
  const [newExType, setNewExType] = createSignal<'reps' | 'timed' | 'distance'>('reps')

  const [newMovementId, setNewMovementId] = createSignal<number | null>(null)
  const [newMode, setNewMode] = createSignal<'fsl' | 'percent'>('fsl')
  const [newPercent, setNewPercent] = createSignal(75)
  const [newSets, setNewSets] = createSignal(5)
  const [newReps, setNewReps] = createSignal(10)

  onMount(load)

  async function load() {
    const l = await db.lifts.get(props.liftId)
    setLift(l ?? null)
    setExercises(await db.exercises.toArray())
    setAccessories((await db.liftAccessories.where('liftId').equals(props.liftId).toArray()).sort((a, b) => a.order - b.order))
    setBlocks((await db.liftSupplementals.where('liftId').equals(props.liftId).toArray()).sort((a, b) => a.order - b.order))
    setActiveLifts((await db.lifts.orderBy('order').toArray()).filter(x => !x.archived))
  }

  const exName = (id: number) => exercises().find(e => e.id === id)?.name ?? '?'
  const liftName = (id: number) => activeLifts().find(l => l.id === id)?.name ?? '?'

  const assignedIds = () => new Set(accessories().map(a => a.exerciseId))
  const availableExercises = () => exercises().filter(e => !e.archived && !assignedIds().has(e.id!))

  // Each other lift may back at most one cross block per day, keeping override
  // and offset bookkeeping unambiguous.
  const usedMovementIds = () => new Set(blocks().map(b => b.movementLiftId))
  const movementOptions = () => activeLifts().filter(l => l.id !== props.liftId && !usedMovementIds().has(l.id!))

  const handleAddExisting = async () => {
    const id = pickExId()
    if (!id) return
    await addExerciseToLift(db, props.liftId, id)
    setPickExId(null)
    await load()
  }

  const handleCreateAndAdd = async () => {
    const name = newExName().trim()
    if (!name) return
    const id = await createExercise(db, name, newExType())
    await addExerciseToLift(db, props.liftId, id)
    setNewExName('')
    setNewExType('reps')
    await load()
  }

  const handleRemoveAccessory = async (laId: number) => {
    await removeExerciseFromLift(db, laId)
    await load()
  }

  const handleAddBlock = async () => {
    const movementLiftId = newMovementId()
    if (!movementLiftId) return
    await addLiftSupplemental(db, {
      liftId: props.liftId,
      movementLiftId,
      weightMode: newMode(),
      percent: newMode() === 'percent' ? newPercent() / 100 : null,
      sets: newSets(),
      reps: newReps(),
    })
    setNewMovementId(null)
    setNewMode('fsl')
    setNewPercent(75)
    setNewSets(5)
    setNewReps(10)
    await load()
  }

  const handleBlockField = async (id: number, patch: Partial<LiftSupplemental>) => {
    await updateLiftSupplemental(db, id, patch)
    await load()
  }

  const handleRemoveBlock = async (id: number) => {
    await removeLiftSupplemental(db, id)
    await load()
  }

  return (
    <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div class="bg-surface border border-accent p-6 font-mono max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="text-accent uppercase tracking-widest text-sm mb-4">
          {lift()?.name ?? 'LIFT'} · SETUP
        </div>

        <Rule label="ASSISTANCE" class="text-muted mb-2" />
        <Show when={accessories().length === 0}>
          <div class="text-faint text-xs py-1">no assistance exercises yet</div>
        </Show>
        <For each={accessories()}>
          {la => (
            <div class="flex items-center justify-between py-0.5 border-b border-border-dim">
              <span class="text-text text-xs">{exName(la.exerciseId)}</span>
              <button onClick={() => void handleRemoveAccessory(la.id!)} class="text-muted text-xs hover:text-danger">del</button>
            </div>
          )}
        </For>

        <div class="flex gap-2 mt-2">
          <select
            value={pickExId() ?? ''}
            onChange={e => setPickExId(Number(e.currentTarget.value) || null)}
            class="bg-surface border border-border text-text px-2 py-1 text-xs flex-1 focus:outline-none"
          >
            <option value="">add existing…</option>
            <For each={availableExercises()}>{ex => <option value={ex.id}>{ex.name}</option>}</For>
          </select>
          <button
            onClick={() => void handleAddExisting()}
            disabled={!pickExId()}
            class="border border-accent text-accent px-2 py-1 text-xs disabled:border-border disabled:text-muted"
          >
            ADD
          </button>
        </div>

        <div class="flex gap-2 mt-2">
          <input
            type="text"
            value={newExName()}
            onInput={e => setNewExName(e.currentTarget.value)}
            placeholder="new exercise"
            class="bg-surface border border-border text-text px-2 py-1 text-xs flex-1 focus:outline-none focus:border-accent"
          />
          <select
            value={newExType()}
            onChange={e => setNewExType(e.currentTarget.value as 'reps' | 'timed' | 'distance')}
            class="bg-surface border border-border text-text px-2 py-1 text-xs focus:outline-none"
          >
            <option value="reps">reps</option>
            <option value="timed">timed</option>
            <option value="distance">distance</option>
          </select>
          <button
            onClick={() => void handleCreateAndAdd()}
            disabled={!newExName().trim()}
            class="border border-accent text-accent px-2 py-1 text-xs disabled:border-border disabled:text-muted"
          >
            NEW
          </button>
        </div>

        <Rule label="CROSS-LIFT SUPPLEMENTAL" class="text-muted mt-6 mb-2" />
        <Show when={blocks().length === 0}>
          <div class="text-faint text-xs py-1">none</div>
        </Show>
        <For each={blocks()}>
          {b => (
            <div class="border border-border-dim p-2 mb-2">
              <div class="flex items-center justify-between mb-1">
                <span class="text-text text-xs uppercase tracking-widest">{liftName(b.movementLiftId)}</span>
                <button onClick={() => void handleRemoveBlock(b.id!)} class="text-muted text-xs hover:text-danger">del</button>
              </div>
              <div class="flex gap-2 mb-2">
                <For each={(['fsl', 'percent'] as const)}>
                  {mode => (
                    <button
                      onClick={() => void handleBlockField(b.id!, { weightMode: mode, percent: mode === 'percent' ? (b.percent ?? 0.75) : null })}
                      class={`px-2 py-0.5 text-xs border ${b.weightMode === mode ? 'border-accent text-accent' : 'border-border text-muted'}`}
                    >
                      {mode === 'fsl' ? 'FSL' : '% TM'}
                    </button>
                  )}
                </For>
              </div>
              <Show when={b.weightMode === 'percent'}>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-muted text-xs w-12">%TM</span>
                  <Stepper value={Math.round((b.percent ?? 0) * 100)} onChange={v => void handleBlockField(b.id!, { percent: v / 100 })} step={5} min={0} max={120} />
                </div>
              </Show>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-muted text-xs w-12">sets</span>
                <Stepper value={b.sets} onChange={v => void handleBlockField(b.id!, { sets: v })} step={1} min={1} max={20} />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-muted text-xs w-12">reps</span>
                <Stepper value={b.reps} onChange={v => void handleBlockField(b.id!, { reps: v })} step={1} min={1} max={50} />
              </div>
            </div>
          )}
        </For>

        <Show when={movementOptions().length > 0} fallback={
          <Show when={blocks().length === 0}>
            <div class="text-faint text-xs py-1">add another main lift first to cross-train</div>
          </Show>
        }>
          <div class="border border-border p-2 mt-1">
            <div class="text-muted text-xs uppercase tracking-widest mb-2">add block</div>
            <select
              value={newMovementId() ?? ''}
              onChange={e => setNewMovementId(Number(e.currentTarget.value) || null)}
              class="bg-surface border border-border text-text px-2 py-1 text-xs w-full mb-2 focus:outline-none"
            >
              <option value="">movement lift…</option>
              <For each={movementOptions()}>{l => <option value={l.id}>{l.name}</option>}</For>
            </select>
            <div class="flex gap-2 mb-2">
              <For each={(['fsl', 'percent'] as const)}>
                {mode => (
                  <button
                    onClick={() => setNewMode(mode)}
                    class={`px-2 py-0.5 text-xs border ${newMode() === mode ? 'border-accent text-accent' : 'border-border text-muted'}`}
                  >
                    {mode === 'fsl' ? 'FSL' : '% TM'}
                  </button>
                )}
              </For>
            </div>
            <Show when={newMode() === 'percent'}>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-muted text-xs w-12">%TM</span>
                <Stepper value={newPercent()} onChange={setNewPercent} step={5} min={0} max={120} />
              </div>
            </Show>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-muted text-xs w-12">sets</span>
              <Stepper value={newSets()} onChange={setNewSets} step={1} min={1} max={20} />
            </div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-muted text-xs w-12">reps</span>
              <Stepper value={newReps()} onChange={setNewReps} step={1} min={1} max={50} />
            </div>
            <button
              onClick={() => void handleAddBlock()}
              disabled={!newMovementId()}
              class="border border-accent text-accent px-3 py-1 text-xs w-full disabled:border-border disabled:text-muted"
            >
              ADD BLOCK
            </button>
          </div>
        </Show>

        <button
          onClick={props.onClose}
          class="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono mt-6"
        >
          DONE
        </button>
      </div>
    </div>
  )
}

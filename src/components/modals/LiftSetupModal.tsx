import { createSignal, onMount, For, Index, Show } from 'solid-js'
import { db } from '../../db/index'
import type { Lift, Exercise } from '../../types/domain'
import { createExercise } from '../../lib/exercise'
import { createLift } from '../../lib/lift'
import Rule from '../layout/Rule'
import Stepper from '../forms/Stepper'

export interface DraftLiftFields {
  name: string
  progressionIncrement: number
  baseWeight: number
  liftType: 'upper' | 'lower'
}

// One buffered cross-lift block. `id` present = already in the db (existing-lift
// edit); absent = added during this session and not yet persisted.
interface DraftBlock {
  id?: number
  movementLiftId: number
  weightMode: 'fsl' | 'percent'
  percent: number | null
  sets: number
  reps: number
}

interface Props {
  // Exactly one of these is set: liftId edits an existing lift, draftLift
  // configures a not-yet-created one.
  liftId?: number
  draftLift?: DraftLiftFields
  // Show a training-max field and persist it on commit (a new lift created
  // outside onboarding, where there's no separate TM step).
  collectTm?: boolean
  onCommit: () => void   // everything persisted — caller should refetch
  onCancel: () => void   // nothing persisted — caller restores prior UI
}

export default function LiftSetupModal(props: Props) {
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [activeLifts, setActiveLifts] = createSignal<Lift[]>([])

  // ── buffered working state — nothing here touches the db until DONE ──────
  const [accExIds, setAccExIds] = createSignal<number[]>([])
  const [blocks, setBlocks] = createSignal<DraftBlock[]>([])
  const [tmInput, setTmInput] = createSignal(props.draftLift?.baseWeight ?? 95)
  const [saving, setSaving] = createSignal(false)

  const [pickExId, setPickExId] = createSignal<number | null>(null)
  const [newExName, setNewExName] = createSignal('')
  const [newExType, setNewExType] = createSignal<'reps' | 'timed' | 'distance'>('reps')

  const [newMovementId, setNewMovementId] = createSignal<number | null>(null)
  const [newMode, setNewMode] = createSignal<'fsl' | 'percent'>('fsl')
  const [newPercent, setNewPercent] = createSignal(75)
  const [newSets, setNewSets] = createSignal(5)
  const [newReps, setNewReps] = createSignal(10)

  const liftLabel = () =>
    props.draftLift?.name ?? activeLifts().find(l => l.id === props.liftId)?.name ?? 'LIFT'

  onMount(load)

  async function load() {
    setExercises(await db.exercises.toArray())
    setActiveLifts((await db.lifts.orderBy('order').toArray()).filter(x => !x.archived))
    if (props.liftId != null) {
      const accs = (await db.liftAccessories.where('liftId').equals(props.liftId).toArray()).sort((a, b) => a.order - b.order)
      setAccExIds(accs.map(a => a.exerciseId))
      const bs = (await db.liftSupplementals.where('liftId').equals(props.liftId).toArray()).sort((a, b) => a.order - b.order)
      setBlocks(bs.map(b => ({ id: b.id, movementLiftId: b.movementLiftId, weightMode: b.weightMode, percent: b.percent, sets: b.sets, reps: b.reps })))
    }
  }

  const exName = (id: number) => exercises().find(e => e.id === id)?.name ?? '?'
  const liftName = (id: number) => activeLifts().find(l => l.id === id)?.name ?? '?'

  const assignedIds = () => new Set(accExIds())
  const availableExercises = () => exercises().filter(e => !e.archived && !assignedIds().has(e.id!))

  // Each other lift may back at most one cross block per day, keeping override
  // and offset bookkeeping unambiguous.
  const usedMovementIds = () => new Set(blocks().map(b => b.movementLiftId))
  const movementOptions = () => activeLifts().filter(l => l.id !== props.liftId && !usedMovementIds().has(l.id!))

  // ── buffer mutations (no db writes) ─────────────────────────────────────
  const handleAddExisting = () => {
    const id = pickExId()
    if (!id || assignedIds().has(id)) return
    setAccExIds(prev => [...prev, id])
    setPickExId(null)
  }

  const handleCreateAndAdd = async () => {
    const name = newExName().trim()
    if (!name) return
    // Exercises live in a shared library, so create the library entry now; only
    // the *assignment* to this lift is buffered until commit.
    const id = await createExercise(db, name, newExType())
    setExercises(await db.exercises.toArray())
    setAccExIds(prev => [...prev, id])
    setNewExName('')
    setNewExType('reps')
  }

  const handleRemoveAccessory = (exId: number) => {
    setAccExIds(prev => prev.filter(x => x !== exId))
  }

  const handleAddBlock = () => {
    const movementLiftId = newMovementId()
    if (!movementLiftId) return
    setBlocks(prev => [...prev, {
      movementLiftId,
      weightMode: newMode(),
      percent: newMode() === 'percent' ? newPercent() / 100 : null,
      sets: newSets(),
      reps: newReps(),
    }])
    setNewMovementId(null)
    setNewMode('fsl')
    setNewPercent(75)
    setNewSets(5)
    setNewReps(10)
  }

  const patchBlock = (idx: number, patch: Partial<DraftBlock>) => {
    setBlocks(prev => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }

  const handleRemoveBlock = (idx: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== idx))
  }

  // ── commit: reconcile the buffer against the db in one transaction ───────
  async function handleCommit() {
    setSaving(true)
    try {
      await db.transaction(async () => {
        let liftId = props.liftId
        if (liftId == null) {
          liftId = await createLift(db, props.draftLift!)
          if (props.collectTm) {
            await db.trainingMaxes.add({ liftId, weight: tmInput(), setAt: new Date() })
          }
        }

        // Assistance: make db rows match accExIds() (membership + order).
        const current = await db.liftAccessories.where('liftId').equals(liftId).toArray()
        const target = accExIds()
        const targetSet = new Set(target)
        for (const a of current) {
          if (!targetSet.has(a.exerciseId)) await db.liftAccessories.delete(a.id!)
        }
        for (let i = 0; i < target.length; i++) {
          const existing = current.find(a => a.exerciseId === target[i])
          if (!existing) await db.liftAccessories.add({ liftId, exerciseId: target[i], order: i })
          else if (existing.order !== i) await db.liftAccessories.update(existing.id!, { order: i })
        }

        // Cross blocks: drop removed, add new (no id), update kept.
        const curBlocks = await db.liftSupplementals.where('liftId').equals(liftId).toArray()
        const keepIds = new Set(blocks().filter(b => b.id != null).map(b => b.id!))
        for (const cb of curBlocks) {
          if (!keepIds.has(cb.id!)) await db.liftSupplementals.delete(cb.id!)
        }
        const draft = blocks()
        for (let i = 0; i < draft.length; i++) {
          const b = draft[i]
          const fields = { movementLiftId: b.movementLiftId, weightMode: b.weightMode, percent: b.percent, sets: b.sets, reps: b.reps, order: i }
          if (b.id == null) await db.liftSupplementals.add({ liftId, ...fields })
          else await db.liftSupplementals.update(b.id, fields)
        }
      })
      props.onCommit()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div class="bg-surface border border-accent p-6 font-mono max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="text-accent uppercase tracking-widest text-sm mb-4">
          {liftLabel()} · SETUP
        </div>

        <Show when={props.collectTm}>
          <Rule label="TRAINING MAX" class="text-muted mb-2" />
          <div class="flex items-center gap-2 mb-6">
            <Stepper value={tmInput()} onChange={setTmInput} step={5} min={0} max={1000} label="tm-new-lift" />
            <span class="text-muted text-xs">lb</span>
          </div>
        </Show>

        <Rule label="ASSISTANCE" class="text-muted mb-2" />
        <Show when={accExIds().length === 0}>
          <div class="text-faint text-xs py-1">no assistance exercises yet</div>
        </Show>
        <For each={accExIds()}>
          {exId => (
            <div class="flex items-center justify-between py-0.5 border-b border-border-dim">
              <span class="text-text text-xs">{exName(exId)}</span>
              <button onClick={() => handleRemoveAccessory(exId)} class="text-muted text-xs hover:text-danger">del</button>
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
            onClick={handleAddExisting}
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
        <Index each={blocks()}>
          {(block, i) => (
            <div class="border border-border-dim p-2 mb-2">
              <div class="flex items-center justify-between mb-1">
                <span class="text-text text-xs uppercase tracking-widest">{liftName(block().movementLiftId)}</span>
                <button onClick={() => handleRemoveBlock(i)} class="text-muted text-xs hover:text-danger">del</button>
              </div>
              <div class="flex gap-2 mb-2">
                <For each={(['fsl', 'percent'] as const)}>
                  {mode => (
                    <button
                      onClick={() => patchBlock(i, { weightMode: mode, percent: mode === 'percent' ? (block().percent ?? 0.75) : null })}
                      class={`px-2 py-0.5 text-xs border ${block().weightMode === mode ? 'border-accent text-accent' : 'border-border text-muted'}`}
                    >
                      {mode === 'fsl' ? 'FSL' : '% TM'}
                    </button>
                  )}
                </For>
              </div>
              <Show when={block().weightMode === 'percent'}>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-muted text-xs w-12">%TM</span>
                  <Stepper value={Math.round((block().percent ?? 0) * 100)} onChange={v => patchBlock(i, { percent: v / 100 })} step={5} min={0} max={120} />
                </div>
              </Show>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-muted text-xs w-12">sets</span>
                <Stepper value={block().sets} onChange={v => patchBlock(i, { sets: v })} step={1} min={1} max={20} />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-muted text-xs w-12">reps</span>
                <Stepper value={block().reps} onChange={v => patchBlock(i, { reps: v })} step={1} min={1} max={50} />
              </div>
            </div>
          )}
        </Index>

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
              onClick={handleAddBlock}
              disabled={!newMovementId()}
              class="border border-accent text-accent px-3 py-1 text-xs w-full disabled:border-border disabled:text-muted"
            >
              ADD BLOCK
            </button>
          </div>
        </Show>

        <div class="flex gap-3 mt-6">
          <button
            onClick={() => void handleCommit()}
            disabled={saving()}
            class="flex-1 border border-accent text-accent py-3 text-xs tracking-widest font-mono disabled:opacity-40"
          >
            {saving() ? 'SAVING…' : 'DONE'}
          </button>
          <button
            onClick={() => props.onCancel()}
            disabled={saving()}
            class="flex-1 border border-border text-muted py-3 text-xs tracking-widest font-mono disabled:opacity-40"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

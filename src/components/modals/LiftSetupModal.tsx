import { createSignal, onMount, For, Index, Show } from 'solid-js'
import { db } from '../../db/index'
import type { Lift, PlateMode } from '../../types/domain'
import { createLift } from '../../lib/lift'
import { PLATE_MODE_LABEL, PLATE_MODES } from '../../lib/plate-loading'
import { settings } from '../../store/settings-store'
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
  const [activeLifts, setActiveLifts] = createSignal<Lift[]>([])
  // All lifts incl. archived — only for resolving cross-block movement names.
  const [allLifts, setAllLifts] = createSignal<Lift[]>([])

  // ── buffered working state — nothing here touches the db until DONE ──────
  const [blocks, setBlocks] = createSignal<DraftBlock[]>([])
  const [tmInput, setTmInput] = createSignal(props.draftLift?.baseWeight ?? 95)
  const [plateMode, setPlateMode] = createSignal<PlateMode>('paired')
  const [implementBase, setImplementBase] = createSignal(settings.barWeight)
  const [saving, setSaving] = createSignal(false)

  const [newMovementId, setNewMovementId] = createSignal<number | null>(null)
  const [newMode, setNewMode] = createSignal<'fsl' | 'percent'>('fsl')
  const [newPercent, setNewPercent] = createSignal(75)
  const [newSets, setNewSets] = createSignal(5)
  const [newReps, setNewReps] = createSignal(10)

  const liftLabel = () =>
    props.draftLift?.name ?? activeLifts().find(l => l.id === props.liftId)?.name ?? 'LIFT'

  onMount(load)

  async function load() {
    const lifts = await db.lifts.orderBy('order').toArray()
    setAllLifts(lifts)
    setActiveLifts(lifts.filter(x => !x.archived))
    if (props.liftId != null) {
      const self = lifts.find(l => l.id === props.liftId)
      if (self) {
        const m = self.plateMode ?? (self.usesBarbell === false ? 'none' : 'paired')
        setPlateMode(m)
        setImplementBase(self.implementBase ?? (m === 'total' ? 0 : settings.barWeight))
      }
      const bs = (await db.liftSupplementals.where('liftId').equals(props.liftId).toArray()).sort((a, b) => a.order - b.order)
      setBlocks(bs.map(b => ({ id: b.id, movementLiftId: b.movementLiftId, weightMode: b.weightMode, percent: b.percent, sets: b.sets, reps: b.reps })))
    }
  }

  // Resolve against all lifts (incl. archived) so a cross block whose movement
  // lift was archived after the fact still shows its name, tagged, not "?".
  const liftName = (id: number) => {
    const l = allLifts().find(x => x.id === id)
    if (!l) return '?'
    return l.archived ? `${l.name} (archived)` : l.name
  }

  // Each other lift may back at most one cross block per day, keeping override
  // and offset bookkeeping unambiguous.
  const usedMovementIds = () => new Set(blocks().map(b => b.movementLiftId))
  const movementOptions = () => activeLifts().filter(l => l.id !== props.liftId && !usedMovementIds().has(l.id!))

  // ── buffer mutations (no db writes) ─────────────────────────────────────
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

        // Persist plate-loading. Store base as null when it equals the mode
        // default so standard-bar lifts keep tracking the global bar setting.
        const m = plateMode()
        const defBase = m === 'paired' ? settings.barWeight : 0
        await db.lifts.update(liftId, {
          plateMode: m,
          implementBase: m === 'none' || implementBase() === defBase ? null : implementBase(),
        })

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

        <Rule label="EQUIPMENT" class="text-muted mb-2" />
        <div class="flex gap-2 mb-2">
          <For each={PLATE_MODES}>
            {m => (
              <button
                onClick={() => { setPlateMode(m); if (m !== 'none') setImplementBase(m === 'paired' ? settings.barWeight : 0) }}
                class={`flex-1 px-2 py-1 text-xs border ${plateMode() === m ? 'border-accent text-accent' : 'border-border text-muted'}`}
              >
                {PLATE_MODE_LABEL[m]}
              </button>
            )}
          </For>
        </div>
        <Show
          when={plateMode() !== 'none'}
          fallback={<div class="text-faint text-xs mb-6">no plate readout</div>}
        >
          <div class="flex items-center gap-2 mb-6">
            <span class="text-muted text-xs w-16">base lb</span>
            <Stepper value={implementBase()} onChange={setImplementBase} step={5} min={0} max={200} label="implement-base" />
            <span class="text-faint text-[10px]">{plateMode() === 'paired' ? 'bar weight' : '0 = belt/dip'}</span>
          </div>
        </Show>

        <Rule label="CROSS-LIFT SUPPLEMENTAL" class="text-muted mb-2" />
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

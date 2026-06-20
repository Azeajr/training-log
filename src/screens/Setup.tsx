import { createSignal, createResource, createEffect, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import { BAR_WEIGHT } from '../lib/calc'
import { createLift, updateLift, deleteLift, moveLift } from '../lib/lift'
import Rule from '../components/layout/Rule'
import Stepper from '../components/forms/Stepper'
import LiftSetupModal from '../components/modals/LiftSetupModal'

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = createSignal<1 | 2 | 3>(1)
  const [tmValues, setTmValues] = createSignal<Record<number, number>>({})
  const [saving, setSaving] = createSignal(false)

  const [lifts, { refetch }] = createResource(() => db.lifts.orderBy('order').toArray())

  createEffect(() => {
    const ls = lifts()
    if (!ls) return
    setTmValues(prev => {
      const next: Record<number, number> = {}
      for (const l of ls) next[l.id!] = prev[l.id!] ?? l.baseWeight
      return next
    })
  })

  function setTmVal(liftId: number, v: number) {
    setTmValues(prev => ({ ...prev, [liftId]: v }))
  }

  // ── roster editing (step 1) ─────────────────────────────────────────────
  const [setupLiftId, setSetupLiftId] = createSignal<number | null>(null)
  const [showAddLift, setShowAddLift] = createSignal(false)
  const [newLiftName, setNewLiftName] = createSignal('')
  const [newLiftIncrement, setNewLiftIncrement] = createSignal(5)
  const [newLiftBase, setNewLiftBase] = createSignal(95)
  const [newLiftType, setNewLiftType] = createSignal<'upper' | 'lower'>('upper')
  const [editingLift, setEditingLift] = createSignal<number | null>(null)
  const [editLiftName, setEditLiftName] = createSignal('')
  const [editLiftIncrement, setEditLiftIncrement] = createSignal(5)

  const handleAddLift = async () => {
    const name = newLiftName().trim()
    if (!name) return
    const id = await createLift(db, {
      name,
      progressionIncrement: newLiftIncrement(),
      baseWeight: newLiftBase(),
      liftType: newLiftType(),
    })
    setShowAddLift(false)
    setNewLiftName('')
    setNewLiftIncrement(5)
    setNewLiftBase(95)
    setNewLiftType('upper')
    await refetch()
    setSetupLiftId(id) // new lift starts empty — assign assistance now
  }

  const handleSaveLiftEdit = async (id: number) => {
    const name = editLiftName().trim()
    if (!name) return
    await updateLift(db, id, { name, progressionIncrement: editLiftIncrement() })
    setEditingLift(null)
    await refetch()
  }

  const handleRemoveLift = async (id: number) => {
    await deleteLift(db, id)
    await refetch()
  }

  const handleMoveLift = async (id: number, direction: 'up' | 'down') => {
    await moveLift(db, id, direction)
    await refetch()
  }

  async function handleStart() {
    setSaving(true)
    try {
      const ls = lifts()!
      const vals = tmValues()
      const rows = ls.map(lift => ({
        liftId: lift.id!,
        weight: vals[lift.id!] ?? lift.baseWeight,
        setAt: new Date(),
      }))
      await db.trainingMaxes.bulkAdd(rows)
      navigate('/today', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  const stepTitle = () =>
    step() === 1 ? 'STEP 1 OF 3 — MAIN LIFTS'
    : step() === 2 ? 'STEP 2 OF 3 — TRAINING MAXES'
    : 'STEP 3 OF 3 — CONFIRM'

  return (
    <div class="max-w-md mx-auto px-4 py-8">
      <div class="mb-8">
        <p class="text-muted text-xs uppercase tracking-widest mb-1">TRAINING LOG</p>
        <h1 class="text-text text-xl font-mono">{stepTitle()}</h1>
      </div>

      {/* ── Step 1: roster ─────────────────────────────────────────────── */}
      <Show when={step() === 1}>
        <p class="text-muted text-xs mb-6">
          Set up your main lifts. The classic 5/3/1 four are ready to go — rename, reorder,
          remove, or add your own. Tap SETUP on a lift to choose its assistance work.
        </p>

        <Rule label="MAIN LIFTS" class="text-muted mb-3" />

        <Show when={lifts.loading}>
          <p class="text-muted text-sm">Loading…</p>
        </Show>

        <For each={lifts()}>
          {(l, i) => (
            <div class="py-1 border-b border-border-dim">
              <Show when={editingLift() === l.id} fallback={
                <div class="flex items-center gap-2">
                  <div class="flex flex-col">
                    <button
                      onClick={() => void handleMoveLift(l.id!, 'up')}
                      disabled={i() === 0}
                      class="text-faint text-xs leading-none hover:text-accent disabled:opacity-30"
                      aria-label="Move up"
                    >▲</button>
                    <button
                      onClick={() => void handleMoveLift(l.id!, 'down')}
                      disabled={i() === (lifts()?.length ?? 0) - 1}
                      class="text-faint text-xs leading-none hover:text-accent disabled:opacity-30"
                      aria-label="Move down"
                    >▼</button>
                  </div>
                  <span class="text-text uppercase tracking-widest text-sm flex-1">{l.name}</span>
                  <span class="text-faint text-xs">+{l.progressionIncrement}</span>
                  <button onClick={() => setSetupLiftId(l.id!)} class="text-muted text-xs hover:text-accent">setup</button>
                  <button
                    onClick={() => { setEditingLift(l.id!); setEditLiftName(l.name); setEditLiftIncrement(l.progressionIncrement) }}
                    class="text-muted text-xs hover:text-accent"
                  >rename</button>
                  <Show when={(lifts()?.length ?? 0) > 1}>
                    <button onClick={() => void handleRemoveLift(l.id!)} class="text-muted text-xs hover:text-danger">remove</button>
                  </Show>
                </div>
              }>
                <div class="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editLiftName()}
                    onInput={e => setEditLiftName(e.currentTarget.value)}
                    class="bg-surface border border-border text-text px-2 py-1 focus:outline-none focus:border-accent"
                  />
                  <div class="flex items-center gap-2">
                    <span class="text-muted text-xs w-20">increment</span>
                    <Stepper value={editLiftIncrement()} onChange={setEditLiftIncrement} step={5} min={0} max={50} />
                    <span class="text-muted text-xs">lb</span>
                  </div>
                  <div class="flex gap-3">
                    <button onClick={() => void handleSaveLiftEdit(l.id!)} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl">SAVE</button>
                    <button onClick={() => setEditingLift(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </For>

        <Show when={showAddLift()} fallback={
          <button
            onClick={() => setShowAddLift(true)}
            class="mt-2 border border-border text-muted px-3 py-1 text-lg sm:text-xl hover:border-accent hover:text-accent"
          >
            + ADD LIFT
          </button>
        }>
          <div class="flex flex-col gap-2 mt-2">
            <input
              type="text"
              value={newLiftName()}
              onInput={e => setNewLiftName(e.currentTarget.value)}
              placeholder="Lift name"
              class="bg-surface border border-border text-text px-2 py-1 focus:outline-none focus:border-accent"
            />
            <div class="flex items-center gap-2">
              <span class="text-muted text-xs w-20">increment</span>
              <Stepper value={newLiftIncrement()} onChange={setNewLiftIncrement} step={5} min={0} max={50} />
              <span class="text-muted text-xs">lb</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted text-xs w-20">base wt</span>
              <Stepper value={newLiftBase()} onChange={setNewLiftBase} step={5} min={0} max={500} />
              <span class="text-muted text-xs">lb</span>
            </div>
            <div class="flex gap-2">
              <For each={(['upper', 'lower'] as const)}>{type => (
                <button
                  onClick={() => setNewLiftType(type)}
                  class={`px-2 py-1 text-xs border ${newLiftType() === type ? 'border-accent text-accent' : 'border-border text-muted'}`}
                >{type}</button>
              )}</For>
            </div>
            <div class="flex gap-3">
              <button onClick={() => void handleAddLift()} disabled={!newLiftName().trim()} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl disabled:border-border disabled:text-muted">ADD</button>
              <button onClick={() => setShowAddLift(false)} class="text-muted text-lg sm:text-xl">cancel</button>
            </div>
          </div>
        </Show>

        <div class="mt-8 flex flex-col gap-3">
          <button
            onClick={() => setStep(2)}
            disabled={lifts.loading || (lifts()?.length ?? 0) === 0}
            class="border border-accent text-accent px-4 py-2 text-sm uppercase tracking-widest disabled:opacity-40"
          >
            NEXT
          </button>
          <button
            onClick={() => navigate('/settings')}
            class="text-muted text-xs uppercase tracking-widest py-2"
          >
            IMPORT INSTEAD
          </button>
        </div>
      </Show>

      {/* ── Step 2: training maxes ─────────────────────────────────────── */}
      <Show when={step() === 2}>
        <p class="text-muted text-xs mb-6">
          Enter your estimated 1-rep max for each lift. The program will calculate working weights from these.
        </p>

        <Rule label="LIFTS" class="text-muted mb-3" />

        <For each={lifts()}>
          {(lift) => (
            <div class="flex items-center gap-3 py-2 border-b border-border-dim">
              <span class="text-text w-24 text-sm uppercase tracking-widest">{lift.name}</span>
              <Stepper
                value={tmValues()[lift.id!] ?? lift.baseWeight}
                onChange={v => setTmVal(lift.id!, v)}
                step={5}
                min={BAR_WEIGHT}
                max={1000}
                label={`tm-${lift.name.toLowerCase().replace(/\s+/g, '-')}`}
              />
              <span class="text-muted text-xs">lb</span>
            </div>
          )}
        </For>

        <div class="mt-8 flex flex-col gap-3">
          <button
            onClick={() => setStep(3)}
            class="border border-accent text-accent px-4 py-2 text-sm uppercase tracking-widest disabled:opacity-40"
          >
            NEXT
          </button>
          <button
            onClick={() => setStep(1)}
            class="text-muted text-xs uppercase tracking-widest py-2"
          >
            BACK
          </button>
        </div>
      </Show>

      {/* ── Step 3: confirm ────────────────────────────────────────────── */}
      <Show when={step() === 3}>
        <p class="text-muted text-xs mb-6">
          Review your training maxes. You can change everything any time in Settings.
        </p>

        <Rule label="TRAINING MAXES" class="text-muted mb-3" />

        <For each={lifts()}>
          {(lift) => (
            <div class="flex items-center justify-between py-2 border-b border-border-dim">
              <span class="text-text text-sm uppercase tracking-widest">{lift.name}</span>
              <span class="text-accent font-mono">{tmValues()[lift.id!] ?? lift.baseWeight} lb</span>
            </div>
          )}
        </For>

        <div class="mt-8 flex flex-col gap-3">
          <button
            onClick={handleStart}
            disabled={saving()}
            class="border border-accent text-accent px-4 py-2 text-sm uppercase tracking-widest disabled:opacity-40"
          >
            {saving() ? 'STARTING…' : 'START TRAINING'}
          </button>
          <button
            onClick={() => setStep(2)}
            class="text-muted text-xs uppercase tracking-widest py-2"
          >
            BACK
          </button>
        </div>
      </Show>

      <Show when={setupLiftId() !== null}>
        <LiftSetupModal
          liftId={setupLiftId()!}
          onClose={() => { setSetupLiftId(null); void refetch() }}
        />
      </Show>
    </div>
  )
}

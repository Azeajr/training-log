import { createSignal, createResource, createEffect, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import { BAR_WEIGHT } from '../lib/calc'
import { updateLift, deleteLift, moveLift } from '../lib/lift'
import { importJson } from '../lib/export-import'
import { loadSettings } from '../store/settings-store'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import ToggleChip from '../components/ui/ToggleChip'
import Stepper from '../components/forms/Stepper'
import LiftSetupModal, { type DraftLiftFields } from '../components/modals/LiftSetupModal'

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = createSignal<1 | 2 | 3>(1)
  const [tmValues, setTmValues] = createSignal<Record<number, number>>({})
  const [saving, setSaving] = createSignal(false)
  const [importError, setImportError] = createSignal<string | null>(null)
  // eslint-disable-next-line no-unassigned-vars -- Solid `ref={importInputRef}` reassigns at runtime
  let importInputRef!: HTMLInputElement

  // Lifts enriched with cross-lift block counts so step 1 can show at a glance
  // what's already been configured on each lift.
  const [lifts, { refetch }] = createResource(async () => {
    const [ls, blocks] = await Promise.all([
      db.lifts.orderBy('order').toArray(),
      db.liftSupplementals.toArray(),
    ])
    return ls.map(l => ({
      ...l,
      crossCount: blocks.filter(b => b.liftId === l.id).length,
    }))
  })

  // Onboarding import: jump straight into the OS file picker instead of routing
  // through Settings. No "overwrite all data" confirm — onboarding only holds
  // seed defaults, there is nothing of the user's to clobber.
  const handleImportFile = async (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setImportError(null)
    try {
      await importJson(db, file)
      await loadSettings()
      navigate('/today', { replace: true })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    }
  }

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
  const [draftLift, setDraftLift] = createSignal<DraftLiftFields | null>(null)
  const [showAddLift, setShowAddLift] = createSignal(false)
  const [newLiftName, setNewLiftName] = createSignal('')
  const [newLiftIncrement, setNewLiftIncrement] = createSignal(5)
  const [newLiftBase, setNewLiftBase] = createSignal(95)
  const [newLiftType, setNewLiftType] = createSignal<'upper' | 'lower'>('upper')
  const [editingLift, setEditingLift] = createSignal<number | null>(null)
  const [editLiftName, setEditLiftName] = createSignal('')
  const [editLiftIncrement, setEditLiftIncrement] = createSignal(5)

  const resetAddForm = () => {
    setNewLiftName('')
    setNewLiftIncrement(5)
    setNewLiftBase(95)
    setNewLiftType('upper')
  }

  // Don't create the lift yet — stash the form values and open setup against a
  // draft. The lift is persisted only if the user commits (DONE) in the modal;
  // cancelling drops them back here with the fields intact.
  const handleAddLift = () => {
    if (!newLiftName().trim()) return
    setDraftLift({
      name: newLiftName().trim(),
      progressionIncrement: newLiftIncrement(),
      baseWeight: newLiftBase(),
      liftType: newLiftType(),
    })
    setShowAddLift(false)
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
        <SectionLabel class="mb-1">TRAINING LOG</SectionLabel>
        <h1 class="text-text text-xl font-mono mb-4">{stepTitle()}</h1>
        {/* Three-step onboarding is a real sequence, so the numbered rail
            encodes true progress — done / current / upcoming. Decorative
            reinforcement of the STEP N title, hidden from SR to avoid echo. */}
        <div class="flex items-center gap-2" aria-hidden="true">
          <For each={[1, 2, 3] as const}>
            {n => (
              <>
                <Show when={n > 1}>
                  <span class={`h-px flex-1 ${step() >= n ? 'bg-accent/60' : 'bg-border-dim'}`} />
                </Show>
                <span
                  class={`w-7 h-7 flex items-center justify-center border font-mono text-xs ${
                    step() === n
                      ? 'border-accent text-accent'
                      : step() > n
                        ? 'border-accent/60 text-accent/70'
                        : 'border-border-dim text-faint'
                  }`}
                >
                  {n}
                </span>
              </>
            )}
          </For>
        </div>
      </div>

      {/* ── Step 1: roster ─────────────────────────────────────────────── */}
      <Show when={step() === 1}>
        <p class="text-muted text-xs mb-6">
          Set up your main lifts. The classic 5/3/1 four are ready to go — rename, reorder,
          remove, or add your own. Tap SETUP on a lift for cross-lift work and equipment.
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
                  <Show when={l.crossCount > 0}>
                    <span class="text-faint text-[10px] tracking-normal">
                      {l.crossCount} cross
                    </span>
                  </Show>
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
                <ToggleChip active={newLiftType() === type} onClick={() => setNewLiftType(type)}>
                  {type}
                </ToggleChip>
              )}</For>
            </div>
            <div class="flex gap-3">
              <button onClick={handleAddLift} disabled={!newLiftName().trim()} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl disabled:border-border disabled:text-muted">ADD</button>
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
            onClick={() => importInputRef.click()}
            class="text-muted text-xs uppercase tracking-widest py-2"
          >
            IMPORT INSTEAD
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            class="hidden"
            onChange={e => void handleImportFile(e)}
          />
          <Show when={importError()}>
            <div class="text-danger text-xs">{importError()}</div>
          </Show>
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

      <Show when={setupLiftId() !== null || draftLift() !== null}>
        <LiftSetupModal
          liftId={setupLiftId() ?? undefined}
          draftLift={draftLift() ?? undefined}
          onCommit={() => { setSetupLiftId(null); setDraftLift(null); resetAddForm(); void refetch() }}
          onCancel={() => {
            const d = draftLift()
            if (d) {
              setNewLiftName(d.name)
              setNewLiftIncrement(d.progressionIncrement)
              setNewLiftBase(d.baseWeight)
              setNewLiftType(d.liftType)
              setShowAddLift(true)
              setDraftLift(null)
            } else {
              setSetupLiftId(null)
            }
          }}
        />
      </Show>
    </div>
  )
}

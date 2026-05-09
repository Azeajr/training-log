import { createSignal, createResource, createEffect, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../../src/db/db-v2'
import Rule from '../components/Rule'
import Stepper from '../components/Stepper'

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = createSignal<1 | 2>(1)
  const [tmValues, setTmValues] = createSignal<Record<number, number>>({})
  const [saving, setSaving] = createSignal(false)

  const [lifts] = createResource(() => db.lifts.orderBy('order').toArray())

  createEffect(() => {
    const ls = lifts()
    if (!ls) return
    const defaults: Record<number, number> = {}
    for (const l of ls) defaults[l.id!] = l.baseWeight
    setTmValues(defaults)
  })

  function setTm(liftId: number, v: number) {
    setTmValues(prev => ({ ...prev, [liftId]: v }))
  }

  async function handleStart() {
    setSaving(true)
    const ls = lifts()!
    const vals = tmValues()
    for (const lift of ls) {
      await db.trainingMaxes.add({
        liftId: lift.id!,
        weight: vals[lift.id!] ?? lift.baseWeight,
        setAt: new Date(),
      })
    }
    navigate('/today', { replace: true })
  }

  return (
    <div class="max-w-md mx-auto px-4 py-8">
      <div class="mb-8">
        <p class="text-muted text-xs uppercase tracking-widest mb-1">TRAINING LOG</p>
        <h1 class="text-text text-xl font-mono">
          {step() === 1 ? 'STEP 1 OF 2 — TRAINING MAXES' : 'STEP 2 OF 2 — CONFIRM'}
        </h1>
      </div>

      <Show when={step() === 1}>
        <p class="text-muted text-xs mb-6">
          Enter your estimated 1-rep max for each lift. The program will calculate working weights from these.
        </p>

        <Rule label="LIFTS" class="text-muted mb-3" />

        <Show when={lifts.loading}>
          <p class="text-muted text-sm">Loading…</p>
        </Show>

        <For each={lifts()}>
          {(lift) => (
            <div class="flex items-center gap-3 py-2 border-b border-border-dim">
              <span class="text-text w-24 text-sm uppercase tracking-widest">{lift.name}</span>
              <Stepper
                value={tmValues()[lift.id!] ?? lift.baseWeight}
                onChange={v => setTm(lift.id!, v)}
                step={5}
                min={45}
                max={1000}
              />
              <span class="text-muted text-xs">lb</span>
            </div>
          )}
        </For>

        <div class="mt-8 flex flex-col gap-3">
          <button
            onClick={() => setStep(2)}
            disabled={lifts.loading || !lifts()}
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

      <Show when={step() === 2}>
        <p class="text-muted text-xs mb-6">
          Review your training maxes. You can change these any time in Settings.
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
            onClick={() => setStep(1)}
            class="text-muted text-xs uppercase tracking-widest py-2"
          >
            BACK
          </button>
        </div>
      </Show>
    </div>
  )
}

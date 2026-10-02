import { createResource, createSignal, For, Show } from 'solid-js'
import { db } from '../../db/index'
import { applyDeload, planDeload } from '../../lib/cycle'
import { useSingleFlight } from '../../hooks/use-single-flight'
import { showToast } from '../../store/toast-store'
import Stepper from '../forms/Stepper'
import Modal from './Modal'

const DEFAULT_DELOAD_PERCENT = 10

interface Props {
  lift?: { id: number; name: string }
  onCancel: () => void
  onComplete: () => void | Promise<void>
}

/** One review-and-confirm flow for a single lift, all lifts, and cycle completion. */
export default function DeloadModal(props: Props) {
  const [pct, setPct] = createSignal(DEFAULT_DELOAD_PERCENT)
  const { busy, guard } = useSingleFlight()
  const [writeError, setWriteError] = createSignal<string | null>(null)
  const [preview] = createResource(
    () => ({ pct: pct(), liftId: props.lift?.id }),
    async ({ pct, liftId }) => {
      try {
        return { plan: await planDeload(db, pct / 100, liftId == null ? undefined : [liftId]), error: null }
      } catch {
        return { plan: null, error: 'Could not load training maxes. Close and try again.' }
      }
    },
  )
  // Never confirm an old preview while a new percentage is being calculated.
  const plan = () => preview.loading ? null : preview()?.plan
  const confirm = guard(async () => {
    const current = plan()
    if (!current?.changes.length) return
    const confirmedPct = pct()
    setWriteError(null)
    try {
      const cut = await applyDeload(db, current)
      showToast(cut.length > 0
        ? `Cut ${cut.length} TM${cut.length === 1 ? '' : 's'} −${confirmedPct}%`
        : 'Nothing cut. Training maxes changed; review them and try again.')
      await props.onComplete()
    } catch {
      setWriteError('Could not finish the deload. Close and review your training maxes before trying again.')
    }
  })

  return (
    <Modal
      title={props.lift ? `DELOAD ${props.lift.name}` : 'DELOAD ALL LIFTS'}
      onClose={props.onCancel}
      busy={busy()}
      initialFocus="container"
      class="bg-surface border border-border p-6 font-mono max-w-sm w-full max-h-[85dvh] overflow-y-auto"
    >
      <p class="text-muted text-sm mb-4">
        Cut {props.lift ? `${props.lift.name}'s training max` : 'all active lifts’ training maxes'} by {pct()}%?
      </p>
      <div class="flex items-center gap-2 mb-4">
        <Stepper value={pct()} onChange={setPct} step={5} min={5} max={30} fieldLabel="deload percent" disabled={busy()} />
        <span class="text-muted text-xs">%</span>
      </div>
      <div class="text-muted text-sm space-y-2 mb-4" aria-live="polite" aria-busy={preview.loading}>
        <Show when={preview.loading}><p>Loading preview…</p></Show>
        <Show when={!preview.loading && preview()?.error}>
          <p role="alert">{preview()?.error}</p>
        </Show>
        <Show when={plan()}>{p => <>
          <For each={p().changes}>{c => <p>{c.liftName}: {c.oldWeight} → {c.weight} lb</p>}</For>
          <Show when={p().alreadyCut.length > 0}><p>Already cut this cycle: {p().alreadyCut.join(', ')}</p></Show>
          <Show when={p().tooLight.length > 0}><p>−{pct()}% rounds back to the same TM: {p().tooLight.join(', ')}</p></Show>
          <Show when={p().changes.length === 0}><p>Nothing to cut at {pct()}%.</p></Show>
        </>}</Show>
      </div>
      <p class="text-faint text-xs mb-4">Effective from your next session. Once per cycle per lift; edit a training max to undo it.</p>
      <Show when={writeError()}><p role="alert" class="text-danger text-sm mb-4">{writeError()}</p></Show>
      <div class="flex flex-wrap gap-3">
        <button onClick={props.onCancel} disabled={busy()} class="border border-border text-muted px-3 py-3 text-xs tracking-widest disabled:opacity-40">CANCEL</button>
        <button
          onClick={() => void confirm()}
          disabled={busy() || !plan()?.changes.length || !!writeError()}
          class="border border-accent text-accent px-3 py-3 text-xs tracking-widest disabled:opacity-40"
        >
          CONFIRM DELOAD −{pct()}%
        </button>
      </div>
    </Modal>
  )
}

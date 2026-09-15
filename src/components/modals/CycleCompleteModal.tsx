import { Show, For } from 'solid-js'
import Modal from './Modal'
import { useSingleFlight } from '../../hooks/use-single-flight'

// Defined in lib/cycle.ts alongside the logic that builds and updates it;
// re-exported here so the modal's existing importers keep working.
export type { CycleCompleteData } from '../../lib/cycle'
import type { CycleCompleteData } from '../../lib/cycle'

interface Props {
  data: CycleCompleteData | null
  onDismiss: () => void | Promise<void>
  onDeload: () => void | Promise<void>
  onDoubleIncrement: (liftId: number, progressionIncrement: number) => void | Promise<void>
}

export default function CycleCompleteModal(props: Props) {
  // Every control here writes training maxes. The callbacks are awaited, and
  // while one is in flight every button is disabled and Modal's own close paths
  // (Escape, "← BACK") are suppressed.
  const { busy, guard } = useSingleFlight()

  return (
    <Show when={props.data}>
      {data => (
        // Escape dismisses rather than deloads: dismiss is the non-destructive
        // arm, and "CUT ALL TMS −10%" is not something a stray keypress does.
        <Modal
          title="CYCLE COMPLETE"
          onClose={() => { void guard(props.onDismiss)() }}
          busy={busy()}
          // The first focusable is a "+X LBS" button, which WRITES a training
          // max — landing focus there arms a non-idempotent write under the next
          // Enter keypress. The rule for this prop is "first control performs a
          // write", not "first control says DELETE" (F47).
          initialFocus="container"
          class="bg-surface border border-accent p-6 font-mono max-w-sm w-full"
        >
          <div>
            <div class="text-muted text-xs mb-4">New training maxes:</div>
            <div class="mb-6 space-y-2">
              <For each={data().newTms}>
                {({ liftName, oldWeight, weight }) => (
                  <div class="flex justify-between text-sm">
                    <span class="text-text uppercase tracking-widest">{liftName}</span>
                    <span class="text-muted">{oldWeight} → <span class="text-accent">{weight} lbs</span></span>
                  </div>
                )}
              </For>
            </div>
            <Show when={data().doublingCandidates.length > 0}>
              <div class="border-t border-border pt-4 mb-6">
                <div class="text-accent uppercase tracking-widest text-xs mb-1">STRONG CYCLE</div>
                <div class="text-muted text-xs mb-3">All AMRAP sets ≥10% above TM. Double increment?</div>
                <div class="space-y-2">
                  <For each={data().doublingCandidates}>
                    {c => (
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-text uppercase tracking-widest">{c.liftName}</span>
                        <button
                          onClick={() => {
                            void guard(() => props.onDoubleIncrement(c.liftId, c.progressionIncrement))()
                          }}
                          disabled={busy()}
                          class="border border-accent text-accent px-3 py-1 text-xs tracking-widest hover:bg-accent/10 disabled:opacity-40"
                        >
                          +{c.progressionIncrement * 2} LBS
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <button
              onClick={() => { void guard(props.onDismiss)() }}
              disabled={busy()}
              class="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono mb-2 disabled:opacity-40"
            >
              CONTINUE
            </button>
            <button
              onClick={() => { void guard(props.onDeload)() }}
              disabled={busy()}
              class="w-full border border-border text-muted py-3 text-xs tracking-widest font-mono hover:border-danger hover:text-danger disabled:opacity-40"
            >
              CUT ALL TMS INSTEAD  −10%
            </button>
          </div>
        </Modal>
      )}
    </Show>
  )
}

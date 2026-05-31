import { Show, For } from 'solid-js'
import type { DoublingCandidate } from '../../lib/tm-recommendations'

export interface CycleCompleteData {
  newTms: Array<{ liftName: string; oldWeight: number; weight: number }>
  doublingCandidates: DoublingCandidate[]
}

interface Props {
  data: CycleCompleteData | null
  onDismiss: () => void
  onDeload: () => void
  onDoubleIncrement: (liftId: number, progressionIncrement: number) => void
}

export default function CycleCompleteModal(props: Props) {
  return (
    <Show when={props.data}>
      {data => (
        <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div class="bg-surface border border-accent p-6 font-mono max-w-sm w-full">
            <div class="text-accent uppercase tracking-widest text-sm mb-1">CYCLE COMPLETE</div>
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
                          onClick={() => props.onDoubleIncrement(c.liftId, c.progressionIncrement)}
                          class="border border-accent text-accent px-3 py-1 text-xs tracking-widest hover:bg-accent/10"
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
              onClick={props.onDismiss}
              class="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono mb-2"
            >
              CONTINUE
            </button>
            <button
              onClick={props.onDeload}
              class="w-full border border-border text-muted py-3 text-xs tracking-widest font-mono hover:border-danger hover:text-danger"
            >
              DELOAD INSTEAD  −10%
            </button>
          </div>
        </div>
      )}
    </Show>
  )
}

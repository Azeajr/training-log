import { createSignal, For } from 'solid-js'
import Modal from './Modal'
import ToggleChip from '../ui/ToggleChip'
import type { AccessoryTmRecommendation } from '../../lib/accessory-tm'

interface Props {
  recommendations: AccessoryTmRecommendation[]
  onAccept: (accepted: AccessoryTmRecommendation[]) => void
  onDismiss: () => void
}

// The accessory counterpart to TmRecommendationModal. Several accessories can
// drift in one session, so this asks about them together rather than stacking
// dialogs — each row opts in, and the whole thing is skippable in one tap.
export default function AccessoryTmModal(props: Props) {
  const [picked, setPicked] = createSignal<number[]>(
    props.recommendations.map(r => r.exerciseId),
  )
  const isPicked = (id: number) => picked().includes(id)
  const toggle = (id: number) =>
    setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  return (
    // Escape keeps every current TM — the same outcome as NOT NOW.
    <Modal
      title="ACCESSORY TM"
      label="Accessory training max adjustments"
      onClose={props.onDismiss}
      class="bg-surface border border-accent p-6 font-mono max-w-sm w-full max-h-[90vh] overflow-y-auto"
    >
      <div>
        <p class="text-muted text-xs -mt-3 mb-4 leading-relaxed">
          You worked these at a weight the program didn't prescribe. Update their training
          maxes so future sessions follow?
        </p>
        <div class="space-y-2 mb-6">
          <For each={props.recommendations}>
            {r => (
              <ToggleChip
                class="w-full text-left"
                active={isPicked(r.exerciseId)}
                onClick={() => toggle(r.exerciseId)}
              >
                <span class="block uppercase">{r.exerciseName}</span>
                <span class="block text-muted">
                  worked {r.workedWeight}lb · TM {r.currentTm} → {r.suggestedTm}lb
                </span>
              </ToggleChip>
            )}
          </For>
        </div>
        <button
          onClick={() =>
            props.onAccept(props.recommendations.filter(r => isPicked(r.exerciseId)))
          }
          disabled={picked().length === 0}
          class="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono mb-2 disabled:opacity-40"
        >
          UPDATE {picked().length === 1 ? 'TM' : `${picked().length} TMS`}
        </button>
        <button
          onClick={props.onDismiss}
          class="w-full border border-border text-muted py-3 text-xs tracking-widest font-mono hover:border-accent"
        >
          NOT NOW
        </button>
      </div>
    </Modal>
  )
}

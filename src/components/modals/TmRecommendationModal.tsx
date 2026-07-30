import { createSignal } from 'solid-js'
import Modal from './Modal'

interface Props {
  liftName: string
  currentTm: number
  suggestedTm: number
  onAccept: (newTm: number) => void
  onDismiss: () => void
}

export default function TmRecommendationModal(props: Props) {
  const [value, setValue] = createSignal(props.suggestedTm)

  return (
    // Escape keeps the current TM — the same outcome as the KEEP CURRENT button.
    <Modal
      title="TM ADJUSTMENT"
      label={`Training max adjustment for ${props.liftName}`}
      onClose={props.onDismiss}
      class="bg-surface border border-accent p-6 font-mono max-w-sm w-full"
    >
      <div>
        <div class="text-muted text-xs -mt-3 mb-4 uppercase tracking-widest">{props.liftName}</div>
        <div class="mb-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Current TM</span>
            <span class="text-text">{props.currentTm} lbs</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Suggested</span>
            <span class="text-accent">{props.suggestedTm} lbs</span>
          </div>
        </div>
        <div class="flex items-center justify-between border border-border px-3 py-2 mb-6">
          <button
            onClick={() => setValue(v => Math.max(45, v - 5))}
            aria-label="Decrease training max"
            class="text-muted text-lg leading-none px-2 hover:text-text"
          >−</button>
          <span class="text-text text-sm tracking-widest" aria-live="polite">{value()} lbs</span>
          <button
            onClick={() => setValue(v => v + 5)}
            aria-label="Increase training max"
            class="text-muted text-lg leading-none px-2 hover:text-text"
          >+</button>
        </div>
        <button
          onClick={() => props.onAccept(value())}
          class="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono mb-2"
        >
          UPDATE TM
        </button>
        <button
          onClick={props.onDismiss}
          class="w-full border border-border text-muted py-3 text-xs tracking-widest font-mono hover:border-accent hover:text-muted"
        >
          KEEP CURRENT
        </button>
      </div>
    </Modal>
  )
}

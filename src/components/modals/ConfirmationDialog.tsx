import { Show } from 'solid-js'
import { useConfirmation } from '../../hooks/use-confirmation'
import Modal from './Modal'

export default function ConfirmationDialog() {
  const { pending, respond } = useConfirmation()

  return (
    <Show when={pending()}>
      {req => (
        // initialFocus="container": the first control here is CONFIRM, and for a
        // destructive request that would put "delete everything" one Enter away
        // from a dialog the user has not read yet. Focus the dialog instead —
        // the name and message are announced, and Tab reaches the buttons.
        <Modal
          title={req().opts.title}
          titleTone="text"
          label={req().opts.title ? undefined : 'Confirm'}
          onClose={() => respond('cancel')}
          initialFocus="container"
          class="bg-surface border border-border p-6 font-mono max-w-sm w-full"
        >
          <div class="text-text-dim text-sm mb-6">{req().message}</div>
          <div class="flex flex-col gap-3">
            <div class="flex gap-3">
              <button
                onClick={() => respond('confirm')}
                class={`flex-1 border py-3 text-xs tracking-widest font-mono ${
                  req().opts.destructive
                    ? 'border-danger text-danger'
                    : 'border-accent text-accent'
                }`}
              >
                {req().opts.confirmLabel ?? 'CONFIRM'}
              </button>
              <button
                onClick={() => respond('cancel')}
                class="flex-1 border border-border text-muted py-3 text-xs tracking-widest font-mono"
              >
                {req().opts.cancelLabel ?? 'CANCEL'}
              </button>
            </div>
            <Show when={req().opts.secondaryLabel}>
              <button
                onClick={() => respond('secondary')}
                class="w-full border border-danger text-danger py-3 text-xs tracking-widest font-mono"
              >
                {req().opts.secondaryLabel}
              </button>
            </Show>
          </div>
        </Modal>
      )}
    </Show>
  )
}

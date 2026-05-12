import { Show } from 'solid-js'
import { useConfirmation } from '../../hooks/use-confirmation'

export default function ConfirmationDialog() {
  const { pending, respond } = useConfirmation()

  return (
    <Show when={pending()}>
      {req => (
        <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div class="bg-surface border border-border p-6 font-mono max-w-sm w-full">
            <Show when={req().opts.title}>
              <div class="text-text uppercase tracking-widest text-sm mb-2">{req().opts.title}</div>
            </Show>
            <div class="text-text-dim text-sm mb-6">{req().message}</div>
            <div class="flex gap-3">
              <button
                onClick={() => respond(true)}
                class={`flex-1 border py-3 text-xs tracking-widest font-mono ${
                  req().opts.destructive
                    ? 'border-danger text-danger'
                    : 'border-accent text-accent'
                }`}
              >
                {req().opts.confirmLabel ?? 'CONFIRM'}
              </button>
              <button
                onClick={() => respond(false)}
                class="flex-1 border border-border text-muted py-3 text-xs tracking-widest font-mono"
              >
                {req().opts.cancelLabel ?? 'CANCEL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

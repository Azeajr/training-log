import { createSignal, For, Show } from 'solid-js'
import { failures, clearSaveFailure, type SaveFailure } from '../../store/save-failure-store'

// The persistent half of failed-save reporting. The toast still fires for the
// glance case; this stays put until the user retries or dismisses, so a set the
// database refused can't disappear unnoticed while the user is under the bar.
export default function SaveFailureBanner() {
  const [retrying, setRetrying] = createSignal<number | null>(null)

  const handleRetry = async (f: SaveFailure) => {
    if (!f.retry) return
    setRetrying(f.id)
    try {
      await f.retry()
      clearSaveFailure(f.id)
    } catch {
      // Still failing. Leave the banner up — it is the record that the set is
      // missing, and a second failure is not new information to announce.
    } finally {
      setRetrying(null)
    }
  }

  return (
    <Show when={failures().length > 0}>
      <div role="alert" class="border border-danger mb-4">
        <For each={failures()}>
          {f => (
            <div class="px-3 py-2 border-b border-danger/30 last:border-b-0">
              <div class="text-danger text-xs uppercase tracking-widest mb-1">Not saved</div>
              <div class="text-text text-sm mb-0.5">{f.describe}</div>
              <div class="text-faint text-xs mb-2 break-words">{f.message}</div>
              <div class="flex gap-3">
                <Show when={f.retry}>
                  <button
                    onClick={() => void handleRetry(f)}
                    disabled={retrying() === f.id}
                    class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase disabled:opacity-40"
                  >
                    {retrying() === f.id ? 'RETRYING…' : 'RETRY'}
                  </button>
                </Show>
                <button
                  onClick={() => clearSaveFailure(f.id)}
                  aria-label={`Dismiss unsaved ${f.describe}`}
                  class="text-muted px-3 py-1 text-xs tracking-widest uppercase"
                >
                  dismiss
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

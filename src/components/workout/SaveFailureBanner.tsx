import { createSignal, For, Show } from 'solid-js'
import { failures, clearSaveFailure, type SaveFailure } from '../../store/save-failure-store'

// The persistent half of failed-save reporting. The toast still fires for the
// glance case; this stays put until the user retries or dismisses, so a set the
// database refused can't disappear unnoticed while the user is under the bar.
export default function SaveFailureBanner() {
  // A set of ids, not one slot. This tracked in-flight state for a LIST with a
  // single `number | null`, which got two things wrong at once: retrying B
  // re-enabled A's button while A's write was still in flight, and whichever
  // settled first cleared the marker for both. The retry closure re-attempts the
  // original write, so a duplicate accepted retry wrote the set twice — on the
  // one path whose whole purpose is recovering a set already lost once.
  const [retrying, setRetrying] = createSignal<ReadonlySet<number>>(new Set())
  const isRetrying = (id: number) => retrying().has(id)

  const handleRetry = async (f: SaveFailure) => {
    if (!f.retry || isRetrying(f.id)) return
    setRetrying(prev => new Set(prev).add(f.id))
    try {
      await f.retry()
      clearSaveFailure(f.id)
    } catch {
      // Still failing. Leave the banner up — it is the record that the set is
      // missing, and a second failure is not new information to announce.
    } finally {
      setRetrying(prev => {
        const next = new Set(prev)
        next.delete(f.id)
        return next
      })
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
                    disabled={isRetrying(f.id)}
                    class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase disabled:opacity-40"
                  >
                    {isRetrying(f.id) ? 'RETRYING…' : 'RETRY'}
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

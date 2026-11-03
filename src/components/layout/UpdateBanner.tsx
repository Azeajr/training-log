import { Show } from 'solid-js'

interface Props {
  ready: boolean
  onApply: () => void
}

// A new deploy has installed and is waiting for this page to let it in (see
// lib/sw-update.ts). Nothing is lost by taking it: the reload restores a live
// session or PT run from their own persistence. Left alone, it takes effect
// the next time the app is fully closed and reopened.
export default function UpdateBanner(props: Props) {
  return (
    <Show when={props.ready}>
      <button
        onClick={() => props.onApply()}
        class="block w-full text-left border border-accent text-accent px-4 py-3 text-xs tracking-widest uppercase mb-6"
      >
        UPDATE READY — RELOAD
      </button>
    </Show>
  )
}

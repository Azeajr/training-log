import { createSignal, Show } from 'solid-js'

// A one-tap "are you sure" in the row itself — for taking back work still in
// progress: a set just logged, a row in an unsaved draft. Deleting saved
// history is not that: it goes through the modal confirm (`destructive`),
// which has room to name what is lost and say it cannot be undone.
interface Props {
  label: string
  confirmText: string
  onConfirm: () => void
  class?: string
  stopPropagation?: boolean
  strong?: boolean
  // Accessible name for the trigger, needed when `label` is a bare glyph like
  // "✕" that announces as itself and says nothing about what it removes. Also
  // disambiguates the yes/no pair, which is otherwise two identically-named
  // buttons per row.
  ariaLabel?: string
}

// The bare glyph (✕) that starts a removal: here, where the confirm is inline,
// and on rows whose removal goes to the modal instead (PT). One look for both.
export const GLYPH_BUTTON_CLASS = 'text-muted text-xs font-mono hover:text-danger'

export default function InlineConfirm(props: Props) {
  const [confirming, setConfirming] = createSignal(false)

  const handle = (e: MouseEvent, fn: () => void) => {
    if (props.stopPropagation) e.stopPropagation()
    fn()
  }

  return (
    <Show
      when={!confirming()}
      fallback={
        <div class={`flex items-center gap-2${props.class ? ` ${props.class}` : ''}`}>
          <span class="text-danger text-xs">{props.confirmText}</span>
          <button
            onClick={e => handle(e, () => { props.onConfirm(); setConfirming(false) })}
            aria-label={props.ariaLabel ? `Yes, ${props.ariaLabel.toLowerCase()}` : undefined}
            class="text-danger text-xs font-mono border border-danger px-1"
          >
            yes
          </button>
          <button
            onClick={e => handle(e, () => setConfirming(false))}
            aria-label={props.ariaLabel ? `No, keep ${props.ariaLabel.replace(/^remove /i, '')}` : undefined}
            class="text-muted text-xs font-mono"
          >
            no
          </button>
        </div>
      }
    >
      <button
        onClick={e => handle(e, () => setConfirming(true))}
        aria-label={props.ariaLabel}
        class={`${props.strong ? 'text-danger/50 text-sm font-mono hover:text-danger' : GLYPH_BUTTON_CLASS}${props.class ? ` ${props.class}` : ''}`}
      >
        {props.label}
      </button>
    </Show>
  )
}

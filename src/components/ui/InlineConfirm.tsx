import { createSignal, Show } from 'solid-js'

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
        class={`${props.strong ? 'text-danger/50 text-sm' : 'text-muted text-xs'} font-mono hover:text-danger${props.class ? ` ${props.class}` : ''}`}
      >
        {props.label}
      </button>
    </Show>
  )
}

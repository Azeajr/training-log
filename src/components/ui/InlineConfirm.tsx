import { createSignal, Show } from 'solid-js'

interface Props {
  label: string
  confirmText: string
  onConfirm: () => void
  class?: string
  stopPropagation?: boolean
  strong?: boolean
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
            class="text-danger text-xs font-mono border border-danger px-1"
          >
            yes
          </button>
          <button
            onClick={e => handle(e, () => setConfirming(false))}
            class="text-muted text-xs font-mono"
          >
            no
          </button>
        </div>
      }
    >
      <button
        onClick={e => handle(e, () => setConfirming(true))}
        class={`${props.strong ? 'text-danger/50 text-sm' : 'text-muted text-xs'} font-mono hover:text-danger${props.class ? ` ${props.class}` : ''}`}
      >
        {props.label}
      </button>
    </Show>
  )
}

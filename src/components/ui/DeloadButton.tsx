interface Props {
  /** Omit for all active lifts. */
  liftName?: string
  onClick: () => void
  disabled?: boolean
  /** Compact text action for a list row, alongside actions such as edit. */
  inline?: boolean
  fullWidth?: boolean
}

/** Shared entry control; percentages belong in the deload dialog. */
export default function DeloadButton(props: Props) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled}
      aria-label={props.liftName ? `Deload ${props.liftName}` : undefined}
      class={`text-muted text-xs disabled:opacity-40 ${props.inline
        ? 'hover:text-accent'
        : 'border border-border px-3 py-3 font-mono tracking-widest uppercase hover:border-warn hover:text-warn'}`}
      classList={{ 'w-full': props.fullWidth }}
    >
      {props.liftName ? 'deload' : 'DELOAD ALL'}
    </button>
  )
}

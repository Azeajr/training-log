interface Props {
  /** What could not be read, as a sentence: "Could not load routine". */
  title: string
  error: string
  onRetry: () => void
  class?: string
}

// A screen that cannot read its data has to say so, and offer the way out.
// Without it an empty list reads "No routines yet" — which describes an empty
// log, not an unreadable one, and is what the user sees when everything is
// working (F21). Every screen-level read failure renders through here so the
// wording, the alert role and the RETRY affordance stay identical.
export default function AsyncErrorBox(props: Props) {
  return (
    <div role="alert" class={`border border-danger px-3 py-2 ${props.class ?? ''}`}>
      <div class="text-danger text-xs uppercase tracking-widest mb-1">{props.title}</div>
      <div class="text-text-dim text-sm mb-2 break-words">{props.error}</div>
      <button
        onClick={props.onRetry}
        class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase"
      >
        RETRY
      </button>
    </div>
  )
}

const FILL = '-'.repeat(80)

interface Props {
  label?: string
  class?: string
  // Classes for the label span only — e.g. an underline that should mark the
  // tappable label without underlining the dash fill too.
  labelClass?: string
  // Trailing info rendered after the label but outside the labelClass span —
  // e.g. ". WEEK 2" stays plain while the lift name carries the underline.
  labelSuffix?: string
  // Set when a caller supplies the accessible name some other way and this
  // instance is pure decoration (the dashes read as noise otherwise).
  'aria-hidden'?: boolean | 'true' | 'false'
}

export default function Rule(props: Props) {
  return (
    <div
      aria-hidden={props['aria-hidden']}
      class={`flex overflow-hidden whitespace-pre text-xs tracking-widest uppercase ${props.class ?? 'text-muted'}`}
    >
      {/* The dashes are the look; they are not the name. Rendered as ordinary
          text they became part of the accessible text of every divider in the
          app — sixteen call sites, of which exactly one worked around it. The
          workaround belongs here, so callers need no aria-hidden and Modal can
          drop its own (F64). */}
      {props.label
        ? (
          <>
            <span aria-hidden="true" class="shrink-0">--- </span>
            {/* The label gives way before anything after it. This was one
                clipped line, so a long name cut off whatever followed it — on
                a phone, a lift's ". WEEK 4 . DELOAD" or a PT run's "1/3" —
                with nothing to say anything was missing. Now the name ends in
                an ellipsis and the suffix stays; the fill takes what is left. */}
            <span class={`truncate ${props.labelClass ?? ''}`}>{props.label}</span>
            {props.labelSuffix ? <span class="shrink-0">{` ${props.labelSuffix}`}</span> : null}
            <span aria-hidden="true" class="flex-1 min-w-0 overflow-hidden"> {FILL}</span>
          </>
        )
        : <span aria-hidden="true">{FILL}</span>}
    </div>
  )
}

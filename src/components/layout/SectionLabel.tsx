import type { JSX } from 'solid-js'

interface Props {
  children: JSX.Element
  // Text tone token; defaults to text-muted. text-faint for a dimmer sub-group.
  tone?: string
  class?: string
}

// The plain section eyebrow — UPPERCASE, tracking-widest, muted. The lighter
// sibling of Rule (which draws the `--- LABEL ---` divider): use SectionLabel
// to head a set list or a form group where a full rule reads too heavy.
export default function SectionLabel(props: Props) {
  return (
    <div class={`${props.tone ?? 'text-muted'} uppercase text-xs tracking-widest ${props.class ?? ''}`}>
      {props.children}
    </div>
  )
}

import type { JSX } from 'solid-js'

interface Props {
  children: JSX.Element
  class?: string
}

// The plain section eyebrow — UPPERCASE, tracking-widest, muted. The lighter
// sibling of Rule (which draws the `--- LABEL ---` divider): use SectionLabel
// to head a set list or a form group where a full rule reads too heavy.
export default function SectionLabel(props: Props) {
  return (
    <div class={`text-muted uppercase text-xs tracking-widest ${props.class ?? ''}`}>
      {props.children}
    </div>
  )
}

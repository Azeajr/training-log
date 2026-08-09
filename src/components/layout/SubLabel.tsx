import type { JSX } from 'solid-js'

interface Props {
  children: JSX.Element
  class?: string
}

// The 10px caps sub-label — nests under a SectionLabel header where a second
// full eyebrow would read too heavy (set-type groups, notes blocks in the
// history views).
export default function SubLabel(props: Props) {
  return (
    <div class={`text-muted text-[10px] uppercase tracking-widest ${props.class ?? ''}`}>
      {props.children}
    </div>
  )
}

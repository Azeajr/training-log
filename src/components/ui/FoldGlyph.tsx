interface Props {
  expanded: boolean
  class?: string
}

// The house fold/unfold marker. Triangles, not −/+: the steppers are already
// covered in −/+ glyphs, and a second meaning for the same character is
// confusing on screen and ambiguous to anything querying by text. One source of
// truth so a new collapsible never has to pick its own — the glyph atlas pinned
// at the `EDIT →` site in History.tsx assigns ▸/▾ to fold and nothing else.
export default function FoldGlyph(props: Props) {
  return (
    <span class={props.class ?? 'text-faint text-xs'} aria-hidden="true">
      {props.expanded ? '▾' : '▸'}
    </span>
  )
}

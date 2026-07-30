const FILL = '-'.repeat(80)

interface Props {
  label?: string
  class?: string
  // Set when a caller supplies the accessible name some other way and this
  // instance is pure decoration (the dashes read as noise otherwise).
  'aria-hidden'?: boolean | 'true' | 'false'
}

export default function Rule(props: Props) {
  return (
    <div
      aria-hidden={props['aria-hidden']}
      class={`overflow-hidden whitespace-nowrap text-xs tracking-widest uppercase ${props.class ?? 'text-muted'}`}
    >
      {props.label ? `--- ${props.label} ${FILL}` : FILL}
    </div>
  )
}

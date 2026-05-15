const FILL = '-'.repeat(80)

interface Props {
  label?: string
  class?: string
}

export default function Rule(props: Props) {
  return (
    <div class={`overflow-hidden whitespace-nowrap text-xs tracking-widest uppercase ${props.class ?? 'text-muted'}`}>
      {props.label ? `--- ${props.label} ${FILL}` : FILL}
    </div>
  )
}

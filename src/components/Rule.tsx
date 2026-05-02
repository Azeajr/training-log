const FILL = '-'.repeat(80)

interface Props {
  label?: string
  className?: string
}

export default function Rule({ label, className = 'text-muted' }: Props) {
  return (
    <div className={`overflow-hidden whitespace-nowrap text-xs tracking-widest uppercase ${className}`}>
      {label ? `--- ${label} ${FILL}` : FILL}
    </div>
  )
}

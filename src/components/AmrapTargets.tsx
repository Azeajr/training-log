import type { AmrapTarget } from '../lib/calc'

interface Props {
  targets: AmrapTarget[]
}

export default function AmrapTargets({ targets }: Props) {
  if (targets.length === 0) return null
  return (
    <div className="mt-1 space-y-0.5">
      {targets.map(t => (
        <div key={t.label} className="text-xs text-amber-400 font-mono">
          -&gt; {t.label.toUpperCase().padEnd(14)} {t.reps} reps{' '}
          <span className="text-zinc-500">({t.est1RM}lb est. 1RM)</span>
        </div>
      ))}
    </div>
  )
}

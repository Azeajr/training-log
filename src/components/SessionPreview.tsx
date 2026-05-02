import type { WarmupSet, MainSet, FslSet } from '../lib/calc'

interface Props {
  warmup: WarmupSet[]
  main: MainSet[]
  fsl: FslSet[]
}

export default function SessionPreview({ warmup, main, fsl }: Props) {
  return (
    <div className="space-y-4 font-mono text-sm">
      <div>
        <div className="text-muted uppercase text-xs tracking-widest mb-1">WARM UP</div>
        {warmup.map((s, i) => (
          <div key={i} className="flex gap-4 text-text-dim pl-2">
            <span className="w-16 text-right">{s.weight}lb</span>
            <span>x {s.reps}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-muted uppercase text-xs tracking-widest mb-1">MAIN</div>
        {main.map((s, i) => (
          <div key={i} className="flex gap-4 text-text pl-2">
            <span className="w-16 text-right">{s.weight}lb</span>
            <span>x {s.reps}{s.isAmrap ? '+' : ''}</span>
            {s.isAmrap && <span className="text-warn text-xs">AMRAP</span>}
          </div>
        ))}
      </div>
      <div>
        <div className="text-muted uppercase text-xs tracking-widest mb-1">FSL  5 x 10</div>
        {fsl.slice(0, 1).map((s, i) => (
          <div key={i} className="flex gap-4 text-text-dim pl-2">
            <span className="w-16 text-right">{s.weight}lb</span>
            <span>x {s.reps}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

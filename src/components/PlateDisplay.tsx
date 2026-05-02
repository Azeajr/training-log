import { useSettingsStore } from '../store/settingsStore'
import { calcPlatesPerSide } from '../lib/calc'

interface Props {
  weight: number
}

export default function PlateDisplay({ weight }: Props) {
  const { barWeight, plates } = useSettingsStore()
  const result = calcPlatesPerSide(weight, barWeight, plates)
  if (result === null) return null

  if (result.length === 0) {
    return (
      <div className="text-faint text-xs font-mono mt-1">bar only</div>
    )
  }

  const items: number[] = []
  for (const { weight: w, count } of result) {
    for (let i = 0; i < count; i++) items.push(w)
  }

  return (
    <div className="text-faint text-xs font-mono mt-1">
      {`each side: ${items.join(' · ')}`}
    </div>
  )
}

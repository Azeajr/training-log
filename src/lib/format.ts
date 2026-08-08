import { formatDuration } from './calc'

export function formatDateShort(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateLong(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Local YYYY-MM-DD — NOT toISOString(), which is UTC and shifts the day for
// evening workouts in negative-offset zones (a 9pm-EST session on the 20th
// would export as the 21st). formatDateShort/Long render the local day, so the
// CSV/filename date must agree with what the rest of the UI shows.
export function formatDateIso(d: Date | string): string {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// One accessory set's value for SetReadout: reps, else duration (m:ss), else
// distance (ft), else empty. Single definition — History, ExerciseHistoryModal,
// and AccessoryLog each rendered this by hand and had already drifted once
// (raw "150s" vs "2:30").
export function accessorySetValue(s: { reps?: number | null; duration?: number | null; distance?: number | null }): string {
  return s.reps != null ? `${s.reps}`
    : s.duration != null ? formatDuration(s.duration)
    : s.distance != null ? `${s.distance}ft`
    : ''
}

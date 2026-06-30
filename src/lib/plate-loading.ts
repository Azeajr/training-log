import type { Lift, Exercise, PlateMode } from '../types/domain'
import type { PlateLoadMode } from './calc'

// Short labels for the equipment mode picker.
export const PLATE_MODE_LABEL: Record<PlateMode, string> = {
  none: 'NONE',
  paired: 'PER SIDE',
  total: 'TOTAL',
}
export const PLATE_MODES = ['none', 'paired', 'total'] as const

// Effective plate-loading for a set: the display mode plus the implement base
// weight (bar/carriage) to subtract before distributing plates.
export interface PlateLoading {
  mode: PlateLoadMode
  base: number
}

// `plateMode` is authoritative when set. When unset, fall back to the legacy
// `usesBarbell` flag via the entity's default mode. `implementBase` undefined ⇒
// mode default (paired → global bar, total → 0), so standard-bar lifts track the
// global barWeight setting and only overrides (hex bar, machine) store a number.
function resolve(
  plateMode: PlateMode | undefined,
  implementBase: number | null | undefined,
  fallbackMode: PlateMode,
  barWeight: number,
): PlateLoading | null {
  const mode = plateMode ?? fallbackMode
  if (mode === 'none') return null
  const base = implementBase ?? (mode === 'paired' ? barWeight : 0)
  return { mode, base }
}

type LoadingFields = Pick<Lift, 'plateMode' | 'implementBase' | 'usesBarbell'>

// Lifts default to barbell (paired) — preserves v1 behaviour for untouched lifts.
export const resolveLiftLoading = (lift: LoadingFields, barWeight: number): PlateLoading | null =>
  resolve(lift.plateMode, lift.implementBase, lift.usesBarbell === false ? 'none' : 'paired', barWeight)

// Accessories default to none — only an explicit usesBarbell=true (or plateMode)
// opts them into a readout.
export const resolveExerciseLoading = (ex: Pick<Exercise, 'plateMode' | 'implementBase' | 'usesBarbell'>, barWeight: number): PlateLoading | null =>
  resolve(ex.plateMode, ex.implementBase, ex.usesBarbell === true ? 'paired' : 'none', barWeight)

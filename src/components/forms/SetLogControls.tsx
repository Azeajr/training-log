import type { JSX } from 'solid-js'
import Stepper from './Stepper'

// Shared label + control row. One source of truth for how every weight/reps/
// duration field is labelled so the act of entering a set looks identical
// across the main, cross-lift, and accessory loggers.
export function FieldRow(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex items-center gap-2">
      <span class="text-xs text-faint uppercase tracking-widest w-12 shrink-0">{props.label}</span>
      {props.children}
    </div>
  )
}

interface Props {
  weight: number
  onWeightChange: (v: number) => void
  weightStep?: number
  // Value FieldRow(s): reps for main/cross, reps|time|distance for accessory.
  children: JSX.Element
  onLog: () => void
  logLabel?: string
}

// The active-set input cluster: an always-visible weight stepper, the value
// rows, and the LOG button — laid out identically across the main, cross-lift,
// and accessory loggers. The header readout + container chrome stay with each
// caller; only the input act is unified here.
export default function SetLogControls(props: Props) {
  return (
    <div class="mt-3 flex flex-col gap-2">
      <FieldRow label="wt">
        <Stepper
          value={props.weight}
          onChange={props.onWeightChange}
          step={props.weightStep ?? 2.5}
          min={0}
          label="weight"
        />
      </FieldRow>
      {props.children}
      <button
        onClick={props.onLog}
        class="w-full border border-accent text-accent py-3 font-mono text-sm tracking-widest"
      >
        {props.logLabel ?? 'LOG'}
      </button>
    </div>
  )
}

import type { JSX } from 'solid-js'
import { Show } from 'solid-js'

interface Props {
  weight: number | null | undefined
  // Pre-formatted value: reps ("5"), AMRAP ("5+"), time ("30s"), distance
  // ("100ft"), or "" to omit the "× value" entirely.
  value: string
  size?: 'lg' | 'sm'
  leading?: JSX.Element // e.g. "Set 1:"
  badges?: JSX.Element // AMRAP / JOKER tags — tone owned by the caller
  trailing?: JSX.Element // e1RM, "done", undo — pushed right with ml-auto by caller
  onClick?: () => void
  weightTestId?: string
  // Fixed-width right-aligned weight, for stacked rows that need a column.
  alignWeight?: boolean
  // Row text tone; defaults to text-text (lg) / text-muted (sm).
  tone?: string
  class?: string
}

// The set "readout" — the `<weight>lb × <value>` line shown for every set in
// every logger (main, cross, accessory; active, upcoming, completed). One
// source of truth for the format so the loggers read identically; size + slots
// absorb the per-state differences. Weight and "lb" stay adjacent in the text
// (margin is CSS-only) so substring assertions like "135lb" keep working.
export default function SetReadout(props: Props) {
  const lg = () => props.size === 'lg'
  const hover = () => (props.onClick ? 'hover:text-text-dim' : '')
  return (
    <div
      onClick={props.onClick}
      class={`flex gap-3 ${lg() ? 'items-baseline' : 'items-center text-sm'} ${props.tone ?? (lg() ? 'text-text' : 'text-muted')} ${props.onClick ? 'cursor-pointer' : ''} ${props.class ?? ''}`}
    >
      {props.leading}
      <Show when={props.weight != null}>
        <span
          data-testid={props.weightTestId}
          class={`font-mono ${lg() ? 'text-2xl text-text' : ''} ${props.alignWeight ? 'w-16 text-right' : ''} ${hover()}`}
        >
          {props.weight}<span class={lg() ? 'text-base ml-1' : ''}>lb</span>
        </span>
      </Show>
      <Show when={props.value !== ''}>
        <span class={`${lg() ? 'text-xl text-text' : ''} ${hover()}`}>× {props.value}</span>
      </Show>
      {props.badges}
      {props.trailing}
    </div>
  )
}

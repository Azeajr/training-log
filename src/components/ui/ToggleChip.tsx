import type { JSX } from 'solid-js'

interface Props {
  active: boolean
  onClick: () => void
  children: JSX.Element
  class?: string
}

// A selectable bordered chip — the app's one-of-N toggle idiom (supplemental
// template, deload mode, lift type). Sharp border, hard accent flip on select;
// an unselected chip invites with a hover→accent. One source of truth so every
// toggle group across Settings/Setup reads identically. The `class` slot carries
// per-site layout (e.g. `flex-1`); the color/state contract stays here.
export default function ToggleChip(props: Props) {
  return (
    <button
      onClick={props.onClick}
      class={`border px-2 py-1 text-xs font-mono tracking-widest transition-colors ${
        props.active
          ? 'border-accent text-accent'
          : 'border-border text-muted hover:border-accent hover:text-accent'
      } ${props.class ?? ''}`}
    >
      {props.children}
    </button>
  )
}

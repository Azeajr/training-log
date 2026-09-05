import { For, Show } from 'solid-js'
import type { AccessorySet } from '../../types/domain'
import { accessorySetValue } from '../../lib/format'
import SetReadout from './SetReadout'
import NotesBlock from './NotesBlock'
import SectionLabel from '../layout/SectionLabel'

interface Props {
  /** Section eyebrow — an exercise name or a formatted date. */
  name: string
  sets: AccessorySet[]
  note?: string | null
  class?: string
  /** Override the eyebrow tone (defaults to text-muted via SectionLabel). */
  nameTone?: string
  /** Override the eyebrow classes (defaults to mb-0.5). */
  nameClass?: string
  /**
   * Opens this exercise's history. Where it's wired the name is underlined —
   * the app's one route to "what did I do last time", the same idiom as the
   * workout header, section labels and accessory cards.
   */
  onNameClick?: () => void
}

// The history view of one exercise's work: label, each set as a sm SetReadout,
// then the note. Shared by the History session detail and ExerciseHistoryModal,
// which previously rendered this block by hand in two places.
export default function ExerciseSetsBlock(props: Props) {
  return (
    <div class={props.class}>
      <Show
        when={props.onNameClick}
        fallback={
          <SectionLabel tone={props.nameTone} class={props.nameClass ?? 'mb-0.5'}>{props.name}</SectionLabel>
        }
      >
        <button
          onClick={props.onNameClick}
          aria-label={`View history for ${props.name}`}
          class="text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <SectionLabel tone={props.nameTone} class={props.nameClass ?? 'mb-0.5'}>
            <span class="underline underline-offset-2 decoration-faint hover:decoration-accent">
              {props.name}
            </span>
          </SectionLabel>
        </button>
      </Show>
      <For each={props.sets}>
        {s => (
          <SetReadout
            size="sm"
            alignWeight
            tone="text-text-dim"
            class="pl-2"
            weight={s.weight != null && s.weight > 0 ? s.weight : null}
            value={accessorySetValue(s)}
          />
        )}
      </For>
      <Show when={props.note}>
        <NotesBlock text={props.note!} />
      </Show>
    </div>
  )
}

import { For, Show } from 'solid-js'
import type { AccessorySet } from '../../types/domain'
import { accessorySetValue } from '../../lib/format'
import SetReadout from './SetReadout'
import NotesText from './NotesText'
import SectionLabel from '../layout/SectionLabel'

interface Props {
  /** Section eyebrow — an exercise name or a formatted date. */
  name: string
  sets: AccessorySet[]
  note?: string | null
  class?: string
}

// The history view of one exercise's work: label, each set as a sm SetReadout,
// then the note. Shared by the History session detail and ExerciseHistoryModal,
// which previously rendered this block by hand in two places.
export default function ExerciseSetsBlock(props: Props) {
  return (
    <div class={props.class}>
      <SectionLabel class="mb-0.5">{props.name}</SectionLabel>
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
        <NotesText class="pl-2 text-text-dim" text={props.note!} />
      </Show>
    </div>
  )
}

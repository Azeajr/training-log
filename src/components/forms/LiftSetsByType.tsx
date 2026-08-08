import { For, Show } from 'solid-js'
import type { Set } from '../../types/domain'
import { SET_TYPE_DISPLAY_ORDER } from '../../lib/calc'
import SetReadout from './SetReadout'
import SectionLabel from '../layout/SectionLabel'

interface Props {
  sets: Set[]
  /** Pre-formatted e1RM ("123.4") trailed on the AMRAP row; null hides it. */
  e1rm: string | null
  /**
   * 'section' — SectionLabel eyebrow (History session detail).
   * 'sub' — smaller caps label for nesting under an entry-level SectionLabel
   * (LiftHistoryModal's date header).
   */
  labelVariant: 'section' | 'sub'
}

// One lift session's sets grouped by type in display order, each set a sm
// SetReadout with the session's e1RM trailed on the AMRAP row. Shared by the
// History session detail and LiftHistoryModal so the AMRAP/e1RM idiom has a
// single definition.
export default function LiftSetsByType(props: Props) {
  return (
    <For each={SET_TYPE_DISPLAY_ORDER.filter(t => props.sets.some(s => s.type === t))}>
      {type => {
        const typeSets = props.sets.filter(s => s.type === type)
        return (
          <div class={props.labelVariant === 'sub' ? 'mb-1' : ''}>
            <Show
              when={props.labelVariant === 'sub'}
              fallback={<SectionLabel class="mb-0.5">{type}</SectionLabel>}
            >
              <div class="text-faint text-[10px] uppercase tracking-widest pl-2 mb-0.5">
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </div>
            </Show>
            <For each={typeSets}>
              {s => (
                <SetReadout
                  size="sm"
                  alignWeight
                  tone="text-text-dim"
                  class="pl-2"
                  weight={s.weight}
                  value={`${s.reps}`}
                  badges={s.isAmrap && props.labelVariant === 'sub' ? <span class="text-warn ml-1">AMRAP</span> : undefined}
                  trailing={
                    <Show when={s.isAmrap && props.e1rm}>
                      <span class="text-muted ml-2">est. 1RM: {props.e1rm}lb</span>
                    </Show>
                  }
                />
              )}
            </For>
          </div>
        )
      }}
    </For>
  )
}

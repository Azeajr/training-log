import { For, Show } from 'solid-js'
import type { Set } from '../../types/domain'
import { SET_TYPE_DISPLAY_ORDER } from '../../lib/calc'
import SetReadout from './SetReadout'
import SubLabel from '../layout/SubLabel'

interface Props {
  sets: Set[]
  /** Pre-formatted e1RM ("123.4") trailed on the AMRAP row; null hides it. */
  e1rm: string | null
  /**
   * Movement names by lift id, for labelling cross sets. A cross set trains
   * another lift, and that lift is the only thing distinguishing two blocks in
   * one session — grouped under a bare "Cross" they merge into one list that
   * says nothing about what was trained. Omit it and they still render, just
   * without the name.
   */
  liftNames?: Map<number, string>
}

// One lift session's sets grouped by type in display order, each set a sm
// SetReadout with the session's e1RM trailed on the AMRAP row. Shared by the
// History session detail and LiftHistoryModal so the AMRAP/e1RM idiom has a
// single definition. Type labels are SubLabels — they always nest under a
// header (modal date header, History row) so a full SectionLabel reads too
// heavy.
interface SetGroup { label: string; sets: Set[] }

// One group per set type, in display order — except `cross`, which splits into
// one group per movement lift so two blocks in the same session stay legible
// as the different work they are.
function groups(props: Props): SetGroup[] {
  const out: SetGroup[] = []
  for (const type of SET_TYPE_DISPLAY_ORDER) {
    const sets = props.sets.filter(s => s.type === type)
    if (sets.length === 0) continue
    const title = type.charAt(0).toUpperCase() + type.slice(1)
    if (type !== 'cross') {
      out.push({ label: title, sets })
      continue
    }
    const byLift = new Map<number | undefined, Set[]>()
    for (const s of sets) {
      const key = s.liftId ?? undefined
      byLift.set(key, [...(byLift.get(key) ?? []), s])
    }
    for (const [liftId, liftSets] of byLift) {
      const name = liftId != null ? props.liftNames?.get(liftId) : undefined
      out.push({ label: name ? `${title} · ${name}` : title, sets: liftSets })
    }
  }
  return out
}

export default function LiftSetsByType(props: Props) {
  return (
    <For each={groups(props)}>
      {group => {
        const typeSets = group.sets
        return (
          <div class="mb-1">
            <SubLabel class="pl-2 mb-0.5">{group.label}</SubLabel>
            <For each={typeSets}>
              {s => (
                <SetReadout
                  size="sm"
                  alignWeight
                  tone="text-text-dim"
                  class="pl-2"
                  bandLoad={s.bandLoad}
                  weight={s.weight}
                  value={`${s.reps}`}
                  badges={s.isAmrap ? <span class="text-warn ml-1">AMRAP</span> : undefined}
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

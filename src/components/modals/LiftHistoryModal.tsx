import { createSignal, Show, For, onMount } from 'solid-js'
import { db } from '../../db/index'
import { getLiftHistory, type LiftHistoryEntry } from '../../lib/exercise-history'
import { SET_TYPE_DISPLAY_ORDER } from '../../lib/calc'
import { formatDateLong } from '../../lib/format'
import SetReadout from '../forms/SetReadout'
import NotesText from '../forms/NotesText'
import SectionLabel from '../layout/SectionLabel'
import Modal from './Modal'

interface Props {
  liftName: string
  liftId: number
  onClose: () => void
}

export default function LiftHistoryModal(props: Props) {
  const [entries, setEntries] = createSignal<LiftHistoryEntry[] | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  onMount(() => { void load() })

  const load = async () => {
    try {
      const data = await getLiftHistory(db, props.liftId)
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lift history')
    }
  }

  return (
    <Modal
      variant="sheet"
      title={`HISTORY — ${props.liftName}`}
      label={`Lift history for ${props.liftName}`}
      onClose={props.onClose}
      class="px-4 pb-4 overflow-y-auto"
    >
      <Show when={error()}>
        <div class="text-danger font-mono text-sm p-4">{error()}</div>
      </Show>

      <Show when={!error() && entries() === null}>
        <div class="text-faint text-xs font-mono py-2">Loading...</div>
      </Show>

      <Show when={!error() && entries() !== null && entries()!.length === 0}>
        <div class="text-faint text-xs font-mono py-2">No completed sessions for this lift.</div>
      </Show>

      <Show when={!error() && entries() !== null && entries()!.length > 0}>
        <div class="space-y-4">
          <For each={entries()}>
            {entry => (
              <div>
                <SectionLabel class="mb-0.5">
                  {formatDateLong(entry.date)} — Week {entry.week}{entry.week === 4 ? ' · DELOAD' : ''}
                </SectionLabel>
                <For each={SET_TYPE_DISPLAY_ORDER.filter(t => entry.sets.some(s => s.type === t))}>
                  {type => {
                    const typeSets = entry.sets.filter(s => s.type === type)
                    const label = type.charAt(0).toUpperCase() + type.slice(1)
                    return (
                      <Show when={typeSets.length > 0}>
                        <div class="mb-1">
                          <div class="text-faint text-[10px] uppercase tracking-widest pl-2 mb-0.5">{label}</div>
                          <For each={typeSets}>
                            {s => (
                              <SetReadout
                                size="sm"
                                alignWeight
                                tone="text-text-dim"
                                class="pl-2"
                                weight={s.weight}
                                value={`${s.reps}`}
                                badges={s.isAmrap ? <span class="text-warn ml-1">AMRAP</span> : undefined}
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    )
                  }}
                </For>
                <Show when={entry.notes}>
                  <div class="mt-1">
                    <div class="text-faint text-[10px] uppercase tracking-widest pl-2 mb-0.5">Notes</div>
                    <NotesText class="pl-2 text-text-dim" text={entry.notes!} />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Modal>
  )
}

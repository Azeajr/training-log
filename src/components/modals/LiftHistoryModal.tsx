import { createSignal, Show, For, onMount } from 'solid-js'
import { db } from '../../db/index'
import { getLiftHistory, type LiftHistoryEntry } from '../../lib/exercise-history'
import { estimated1RM } from '../../lib/calc'
import { settings } from '../../store/settings-store'
import { formatDateLong } from '../../lib/format'
import LiftSetsByType from '../forms/LiftSetsByType'
import NotesBlock from '../forms/NotesBlock'
import SectionLabel from '../layout/SectionLabel'
import WeekBadge from '../layout/WeekBadge'
import Modal from './Modal'
import ModalAsyncStates from './ModalAsyncStates'

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
      <ModalAsyncStates error={error()} entries={entries()} emptyText="No completed sessions yet.">
        <div class="space-y-4 divide-y divide-accent">
          <For each={entries()}>
            {entry => {
              // Same derivation as the History session detail: one e1RM per
              // session, off its AMRAP set.
              const amrap = entry.sets.find(s => s.isAmrap)
              const e1rm = amrap?.weight && amrap.reps
                ? estimated1RM(amrap.weight, amrap.reps, settings.highRepDiscount).toFixed(1)
                : null
              return (
              <div>
                <SectionLabel tone="text-text" class="mb-1 font-semibold">
                  {formatDateLong(entry.date)}
                  <WeekBadge week={entry.week} />
                </SectionLabel>
                <LiftSetsByType sets={entry.sets} e1rm={e1rm} />
                <Show when={entry.notes}>
                  <NotesBlock text={entry.notes!} />
                </Show>
              </div>
              )
            }}
          </For>
        </div>
      </ModalAsyncStates>
    </Modal>
  )
}

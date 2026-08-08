import { createSignal, For, onMount } from 'solid-js'
import { db } from '../../db/index'
import { getExerciseHistory, type ExerciseHistoryEntry } from '../../lib/exercise-history'
import { formatDateLong } from '../../lib/format'
import ExerciseSetsBlock from '../forms/ExerciseSetsBlock'
import Modal from './Modal'
import ModalAsyncStates from './ModalAsyncStates'

interface Props {
  exerciseName: string
  exerciseId: number
  onClose: () => void
}

export default function ExerciseHistoryModal(props: Props) {
  const [entries, setEntries] = createSignal<ExerciseHistoryEntry[] | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  onMount(() => { void load() })

  const load = async () => {
    try {
      const data = await getExerciseHistory(db, props.exerciseId)
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exercise history')
    }
  }

  return (
    <Modal
      variant="sheet"
      title={`HISTORY — ${props.exerciseName}`}
      label={`Exercise history for ${props.exerciseName}`}
      onClose={props.onClose}
      class="px-4 pb-4 overflow-y-auto"
    >
      <ModalAsyncStates error={error()} entries={entries()} emptyText="No sessions logged yet.">
        <div class="space-y-3">
          <For each={entries()}>
            {entry => (
              <ExerciseSetsBlock
                name={formatDateLong(entry.date)}
                sets={entry.sets}
                note={entry.notes}
              />
            )}
          </For>
        </div>
      </ModalAsyncStates>
    </Modal>
  )
}

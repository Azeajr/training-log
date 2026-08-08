import { createSignal, Show, For, onMount } from 'solid-js'
import { db } from '../../db/index'
import { getExerciseHistory, type ExerciseHistoryEntry } from '../../lib/exercise-history'
import type { AccessorySet } from '../../types/domain'
import { formatDuration } from '../../lib/calc'
import { formatDateLong } from '../../lib/format'
import SetReadout from '../forms/SetReadout'
import NotesText from '../forms/NotesText'
import SectionLabel from '../layout/SectionLabel'
import Modal from './Modal'

interface Props {
  exerciseName: string
  exerciseId: number
  onClose: () => void
}

const setValue = (s: AccessorySet) =>
  s.reps != null ? `${s.reps}`
  : s.duration != null ? formatDuration(s.duration)
  : s.distance != null ? `${s.distance}ft`
  : ''

const entryWeight = (s: AccessorySet) =>
  s.weight != null && s.weight > 0 ? s.weight : null

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
      <Show when={error()}>
        <div class="text-danger font-mono text-sm p-4">{error()}</div>
      </Show>

      <Show when={!error() && entries() === null}>
        <div class="text-faint text-xs font-mono py-2">Loading...</div>
      </Show>

      <Show when={!error() && entries() !== null && entries()!.length === 0}>
        <div class="text-faint text-xs font-mono py-2">No sessions logged with this exercise.</div>
      </Show>

      <Show when={!error() && entries() !== null && entries()!.length > 0}>
        <div class="space-y-3">
          <For each={entries()}>
            {entry => (
              <div>
                <SectionLabel class="mb-0.5">{formatDateLong(entry.date)}</SectionLabel>
                <For each={entry.sets}>
                  {s => (
                    <SetReadout
                      size="sm"
                      alignWeight
                      tone="text-text-dim"
                      class="pl-2"
                      weight={entryWeight(s)}
                      value={setValue(s)}
                    />
                  )}
                </For>
                <Show when={entry.notes}>
                  <NotesText class="pl-2 text-text-dim" text={entry.notes!} />
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Modal>
  )
}

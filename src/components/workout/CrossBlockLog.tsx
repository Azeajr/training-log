import { For } from 'solid-js'
import type { CrossSet } from '../../lib/calc'
import type { Set } from '../../types/domain'
import SetRow from './SetRow'

// Cross-lift supplemental block. Same render shape as Workout's linear
// SetSection, but driven by a per-block cursor instead of the global
// workout.currentSetIndex — so a block can be logged independently of the
// session's own-lift work (issue #54).
interface Props {
  label: string
  sets: CrossSet[]
  cursor: number
  logged: Set[]
  onLog: (localIdx: number, reps: number, weight: number) => void
  onEdit: (localIdx: number, reps: number, weight: number) => void
  onDelete: () => void
  showPlates?: boolean
}

export default function CrossBlockLog(props: Props) {
  return (
    <div class="mb-6 md:mb-0">
      <div class="text-muted uppercase text-xs tracking-widest mb-2">{props.label}</div>
      <For each={props.sets}>
        {(s, i) => (
          <SetRow
            set={{ ...s, isAmrap: false }}
            isActive={props.cursor === i()}
            isCompleted={i() < props.cursor}
            loggedReps={props.logged[i()]?.reps}
            loggedWeight={props.logged[i()]?.weight}
            onLog={(reps, weight) => props.onLog(i(), reps, weight)}
            onEdit={(reps, weight) => props.onEdit(i(), reps, weight)}
            onDelete={i() === props.cursor - 1 ? props.onDelete : undefined}
            showPlates={props.showPlates}
          />
        )}
      </For>
    </div>
  )
}

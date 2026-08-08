import { For } from 'solid-js'
import type { CrossSet } from '../../lib/calc'
import type { Set } from '../../types/domain'
import type { PlateLoading } from '../../lib/plate-loading'
import SetRow from './SetRow'
import CollapsibleSection from './CollapsibleSection'

// Cross-lift supplemental block. Same render shape as Workout's linear
// SetSection, but driven by a per-block cursor instead of the global
// workout.currentSetIndex — so a block can be logged independently of the
// session's own-lift work (issue #54).
interface Props {
  label: string
  /** Trailing sets×reps/mode info — rendered un-underlined (see CollapsibleSection). */
  labelMeta?: string
  sets: CrossSet[]
  cursor: number
  logged: Set[]
  onLog: (localIdx: number, reps: number, weight: number) => void
  onEdit: (localIdx: number, reps: number, weight: number) => void
  onDelete: () => void
  loading?: PlateLoading | null
  onLabelClick?: () => void
}

export default function CrossBlockLog(props: Props) {
  // The block's own cursor decides completion, not the session's — that's the
  // point of a cross block, and it means one finished block can fold away while
  // the one beside it is still being worked.
  const complete = () => props.sets.length > 0 && props.cursor >= props.sets.length

  return (
    <CollapsibleSection
      label={props.label}
      labelMeta={props.labelMeta}
      complete={complete()}
      summary={`${props.sets.length} sets`}
      class="mb-6 md:mb-0"
      onLabelClick={props.onLabelClick}
    >
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
            loading={props.loading}
          />
        )}
      </For>
    </CollapsibleSection>
  )
}

import { Show } from 'solid-js'

interface Props {
  week: number
  /** "W3" (History row) instead of "— Week 3" (history modal header). */
  short?: boolean
}

// Accent week badge + warn DELOAD marker for week 4. Week 4 is the deload
// whenever it exists (cycleFinalWeek); badge color matches the AMRAP=warn
// semantic.
export default function WeekBadge(props: Props) {
  return (
    <>
      <span class="text-accent">{props.short ? ` W${props.week}` : ` — Week ${props.week}`}</span>
      <Show when={props.week === 4}>
        <span class="text-warn"> . DELOAD</span>
      </Show>
    </>
  )
}

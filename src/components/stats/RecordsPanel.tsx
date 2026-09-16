import { createSignal, createEffect, For, Show } from 'solid-js'
import { createAsyncRead } from '../../lib/async-read'
import { db } from '../../db/index'
import { estimated1RM } from '../../lib/calc'
import { bestEstimatedPerformance, baselineWorkingSets } from '../../lib/performance'
import { settings } from '../../store/settings-store'
import Rule from '../layout/Rule'

interface RecordRow {
  name: string
  e1rm: number | null   // rounded best Wathan e1RM; null when no working set yet
  weight: number | null // the set that produced it
  reps: number | null
  maxWeight: number | null     // heaviest weight actually lifted; measured, not estimated
  maxWeightReps: number | null // reps completed at maxWeight
}

interface TmRow {
  name: string
  current: number
  delta: number       // current − first (0 when a single point / none)
  sequence: number[]  // distinct-consecutive training maxes, oldest → newest
}

interface Props {
  /** Limit to one lift. Omit for the whole active roster. */
  liftId?: number
  /** Records only, no section rules — for embedding above History's chart. */
  compact?: boolean
}

// The two read-only summaries the rest of the app never surfaces in one place:
// the best estimated 1RM per lift (PRs otherwise only flash as a toast
// mid-workout) and the training-max trajectory. Pure views over existing data;
// no writes, no schema. Lives here rather than in a screen so History can show
// the same numbers for the lift already on screen instead of sending the user
// to a second destination that answers the same question.
export default function RecordsPanel(props: Props) {
  const [records, setRecords] = createSignal<RecordRow[]>([])
  const [tms, setTms] = createSignal<TmRow[]>([])

  // Request identity AND a failure state, both from one place.
  //
  // `History.tsx` passes a live signal for `liftId`, so switching the selected
  // lift is the ordinary path — and this effect used to publish whatever
  // settled LAST rather than whatever was asked for last, so a slow earlier
  // load overwrote the lift the user had already moved to (F63).
  //
  // The half F63 left behind: `void load(...)` had no catch and `loading` only
  // cleared after every await resolved, so ANY rejected read — roster,
  // sessions, sets, cross sets, training maxes — escaped as an unhandled
  // rejection and pinned the screen on "Loading…" forever. No error text, no
  // retry, no remount short of navigating away (F23). Worse than stuck: with
  // `records` still empty, what showed through was "NO SETS YET", which
  // describes an empty log rather than an unreadable one.
  const read = createAsyncRead()

  createEffect(() => {
    const only = props.liftId
    void read.run(isCurrent => load(only, isCurrent))
  })

  const load = async (only: number | undefined, isCurrent: () => boolean) => {
    const lifts = (await db.lifts.orderBy('order').toArray())
      .filter(l => !l.archived)
      .filter(l => only == null || l.id === only)

    const recRows: RecordRow[] = []
    const tmRows: TmRow[] = []
    for (const l of lifts) {
      const record: RecordRow = { name: l.name, e1rm: null, weight: null, reps: null, maxWeight: null, maxWeightReps: null }

      // Heaviest weight actually lifted — measured, never estimated. Warmups and
      // failed (0-rep) sets don't count. Cross sets belong to the movement lift
      // they train, not the session's lift, so they're attributed by their own
      // liftId. Ownership is decided once, in baselineWorkingSets: a record here
      // has to be one History will also show, which is what this panel used to
      // get wrong — it filtered nothing but liftId, so skipped and abandoned
      // work set permanent records. Ties on weight keep the set with more reps.
      const working = await baselineWorkingSets(db, l.id!)

      // Best e1RM across all successful working sets — a hard main, joker,
      // supplemental or attributed cross set is a valid strength performance.
      // This is the SAME population the PR toast scores against; both read
      // baselineWorkingSets. The comment here used to call this "intentionally
      // broader than the AMRAP-only PR toast", which stopped being true when
      // the toast was widened — and the two readers disagreeing about what
      // counts as a record was the substance of F38.
      const bestE1rm = bestEstimatedPerformance(working, settings.highRepDiscount)
      if (bestE1rm) {
        record.e1rm = Math.round(estimated1RM(bestE1rm.weight, bestE1rm.reps, settings.highRepDiscount))
        record.weight = bestE1rm.weight
        record.reps = bestE1rm.reps
      }
      if (working.length > 0) {
        const top = working.reduce((a, b) =>
          b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a)
        record.maxWeight = top.weight
        record.maxWeightReps = top.reps
      }
      recRows.push(record)

      // TM trajectory — every logged training max oldest → newest, with runs of
      // the same weight collapsed so the arrow chain shows only real changes.
      const history = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
      const weights = history.map(t => t.weight)
      const sequence = weights.filter((w, i) => i === 0 || w !== weights[i - 1])
      const current = sequence.length > 0 ? sequence[sequence.length - 1] : 0
      const first = sequence.length > 0 ? sequence[0] : 0
      tmRows.push({ name: l.name, current, delta: current - first, sequence })
    }

    // A newer request has superseded this one: drop the result on the floor
    // rather than publishing another lift's records under the current name.
    if (!isCurrent()) return
    setRecords(recRows)
    setTms(tmRows)
  }

  const recordRows = () => (
    <div class={props.compact ? 'space-y-2' : 'space-y-3 mb-10'}>
      <For each={records()}>
        {r => (
          <div>
            <div class="flex items-baseline gap-4">
              <span class="flex-1 truncate text-text uppercase tracking-wider">{r.name}</span>
              <Show
                when={r.maxWeight !== null}
                fallback={<span class="text-faint text-xs tracking-widest">NO SETS YET</span>}
              >
                <span class={`text-accent ${props.compact ? 'text-xl' : 'text-2xl'}`}>
                  {r.maxWeight}<span class="text-xs text-muted ml-1 tracking-widest">LB</span>
                </span>
                <span class="text-muted text-sm w-20 text-right">×{r.maxWeightReps}</span>
              </Show>
            </div>
            <Show when={r.e1rm !== null}>
              <div class="flex items-baseline gap-4 pl-2">
                <span class="flex-1 text-faint text-xs tracking-widest">EST. 1RM</span>
                <span class="text-text text-sm">
                  {r.e1rm}<span class="text-xs text-muted ml-1 tracking-widest">LB</span>
                </span>
                <span class="text-muted text-sm w-20 text-right">{r.weight}×{r.reps}</span>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )

  return (
    <Show
      when={!read.error()}
      fallback={
        <div role="alert" class="border border-danger px-3 py-2">
          <div class="text-danger text-xs uppercase tracking-widest mb-1">Could not read your records</div>
          <div class="text-text-dim text-sm mb-2 break-words">{read.error()}</div>
          <button
            onClick={() => void read.retry()}
            class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase"
          >
            RETRY
          </button>
        </div>
      }
    >
    <Show when={!read.loading()} fallback={<div class="text-muted text-sm tracking-widest uppercase">Loading…</div>}>
      <Show when={!props.compact} fallback={recordRows()}>
        <Rule label="RECORDS" class="text-muted mb-4" />
        {recordRows()}

        <Rule label="TRAINING MAX . PROGRESSION" class="text-muted mb-4" />
        <div class="space-y-4">
          <For each={tms()}>
            {t => (
              <div>
                <div class="flex items-baseline gap-3 mb-1">
                  <span class="flex-1 truncate text-text uppercase tracking-wider">{t.name}</span>
                  <span class="text-text text-lg">
                    {t.current}<span class="text-xs text-muted ml-1 tracking-widest">LB</span>
                  </span>
                  <Show when={t.delta !== 0}>
                    <span
                      class={`text-xs tracking-widest w-12 text-right ${t.delta > 0 ? 'text-accent' : 'text-info'}`}
                    >
                      {t.delta > 0 ? '+' : ''}{t.delta}
                    </span>
                  </Show>
                </div>
                <Show
                  when={t.sequence.length > 1}
                  fallback={
                    <div class="text-faint text-xs tracking-widest pl-2">
                      {t.sequence.length === 1 ? 'NO CHANGES YET' : 'NO TRAINING MAX'}
                    </div>
                  }
                >
                  <div class="text-muted text-xs tracking-wider pl-2 flex flex-wrap gap-x-2 gap-y-1">
                    <For each={t.sequence}>
                      {(w, i) => (
                        <span><Show when={i() > 0}><span class="text-faint">→ </span></Show>{w}</span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
    </Show>
  )
}

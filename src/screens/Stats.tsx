import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../db/index'
import { estimated1RM } from '../lib/calc'
import { settings } from '../store/settings-store'
import Rule from '../components/layout/Rule'

interface RecordRow {
  name: string
  e1rm: number | null   // rounded best Wathan e1RM; null when no AMRAP yet
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

// STATS — two read-only summaries the rest of the app never surfaces in one
// place: the best estimated 1RM per lift (PRs otherwise only flash as a toast
// mid-workout) and the training-max trajectory (the program's core state over
// time). Pure views over existing data; no writes, no schema.
export default function Stats() {
  const [loading, setLoading] = createSignal(true)
  const [records, setRecords] = createSignal<RecordRow[]>([])
  const [tms, setTms] = createSignal<TmRow[]>([])

  onMount(() => { void load() })

  const load = async () => {
    const lifts = (await db.lifts.orderBy('order').toArray()).filter(l => !l.archived)

    const recRows: RecordRow[] = []
    const tmRows: TmRow[] = []
    for (const l of lifts) {
      const sessions = await db.sessions.where('liftId').equals(l.id!).toArray()
      const sessionIds = sessions.map(s => s.id!).filter(Boolean)
      const record: RecordRow = { name: l.name, e1rm: null, weight: null, reps: null, maxWeight: null, maxWeightReps: null }
      const ownSets = sessionIds.length > 0
        ? await db.sets.where('sessionId').anyOf(sessionIds).toArray()
        : []

      // Best AMRAP by Wathan e1RM — mirrors pr.ts: only completed AMRAP sets
      // (isAmrap && reps >= 1) count, so a failed 0-rep set is never a record.
      // Cross sets are always isAmrap:false, so they can't leak in here.
      const amraps = ownSets.filter(s => s.isAmrap && s.reps >= 1)
      if (amraps.length > 0) {
        const top = amraps.reduce((a, b) =>
          estimated1RM(b.weight, b.reps, settings.highRepDiscount) > estimated1RM(a.weight, a.reps, settings.highRepDiscount) ? b : a)
        record.e1rm = Math.round(estimated1RM(top.weight, top.reps, settings.highRepDiscount))
        record.weight = top.weight
        record.reps = top.reps
      }

      // Heaviest weight actually lifted — measured, never estimated. Warmups and
      // failed (0-rep) sets don't count. Cross sets belong to the movement lift
      // they train, not the session's lift, so they're attributed by their own
      // liftId: this lift's sessions contribute their non-cross work, and cross
      // blocks tagged with this lift count even though they live in another
      // lift's session. Ties on weight keep the set with more reps.
      const crossSets = await db.sets.where('liftId').equals(l.id!).toArray()
      const working = [
        ...ownSets.filter(s => s.type !== 'warmup' && s.type !== 'cross'),
        ...crossSets.filter(s => s.type === 'cross'),
      ].filter(s => s.reps >= 1)
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

    setRecords(recRows)
    setTms(tmRows)
    setLoading(false)
  }

  return (
    <div class="p-4 md:p-8 font-mono max-w-3xl mx-auto">
      <Show when={!loading()} fallback={<div class="text-muted text-sm tracking-widest uppercase">Loading…</div>}>
        <Rule label="RECORDS" class="text-muted mb-4" />
        <div class="space-y-3 mb-10">
          <For each={records()}>
            {r => (
              <div>
                <div class="flex items-baseline gap-4">
                  <span class="flex-1 truncate text-text uppercase tracking-wider">{r.name}</span>
                  <Show
                    when={r.maxWeight !== null}
                    fallback={<span class="text-faint text-xs tracking-widest">NO SETS YET</span>}
                  >
                    <span class="text-accent text-2xl">
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
    </div>
  )
}

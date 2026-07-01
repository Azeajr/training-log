import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../db/index'
import { estimated1RM } from '../lib/calc'
import Rule from '../components/layout/Rule'

interface RecordRow {
  name: string
  e1rm: number | null   // rounded best Epley estimated 1RM; null when no AMRAP yet
  weight: number | null // the set that produced it
  reps: number | null
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
      // Best AMRAP by Epley e1RM — mirrors pr.ts: only completed AMRAP sets
      // (isAmrap && reps >= 1) count, so a failed 0-rep set is never a record.
      const sessions = await db.sessions.where('liftId').equals(l.id!).toArray()
      const sessionIds = sessions.map(s => s.id!).filter(Boolean)
      let record: RecordRow = { name: l.name, e1rm: null, weight: null, reps: null }
      if (sessionIds.length > 0) {
        const amraps = (await db.sets.where('sessionId').anyOf(sessionIds).toArray())
          .filter(s => s.isAmrap && s.reps >= 1)
        if (amraps.length > 0) {
          const top = amraps.reduce((a, b) =>
            estimated1RM(b.weight, b.reps) > estimated1RM(a.weight, a.reps) ? b : a)
          record = { name: l.name, e1rm: Math.round(estimated1RM(top.weight, top.reps)), weight: top.weight, reps: top.reps }
        }
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
              <div class="flex items-baseline gap-4">
                <span class="flex-1 truncate text-text uppercase tracking-wider">{r.name}</span>
                <Show
                  when={r.e1rm !== null}
                  fallback={<span class="text-faint text-xs tracking-widest">NO AMRAP YET</span>}
                >
                  <span class="text-accent text-2xl">
                    {r.e1rm}<span class="text-xs text-muted ml-1 tracking-widest">LB e1RM</span>
                  </span>
                  <span class="text-muted text-sm w-20 text-right">{r.weight}×{r.reps}</span>
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

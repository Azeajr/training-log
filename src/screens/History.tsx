import { createSignal, createMemo, createEffect, For, Show } from 'solid-js'
import { useNavigate, useSearchParams } from '@solidjs/router'
import { db } from '../db/index'
import type { Session, Lift, Set as TrainingSet, AccessorySet } from '../types/domain'
import { estimated1RM, formatDuration, SET_TYPE_DISPLAY_ORDER } from '../lib/calc'
import { formatDateShort, formatDateLong } from '../lib/format'

type ViewMode = 'lift' | 'date' | 'calendar'

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

const monthLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface CalendarCell {
  date: Date
  isCurrentMonth: boolean
  sessions: Session[]
}

const HISTORY_LIFT_KEY = 'history-lift'

interface SessionRow {
  session: Session
  liftName: string
  amrapWeight?: number
  amrapReps?: number
}

interface Detail {
  sets: TrainingSet[]
  accessorySets: AccessorySet[]
  exerciseNames: Map<number, string>
  notes: string | null
}

interface ChartPoint { date: Date; weight: number }

function TmChart(props: { primary: ChartPoint[]; secondary?: ChartPoint[] }) {
  const W = 400, H = 80, PAD = 20

  const all = createMemo(() => [...props.primary, ...(props.secondary ?? [])])
  const minDate = createMemo(() => Math.min(...all().map(d => d.date.getTime())))
  const maxDate = createMemo(() => Math.max(...all().map(d => d.date.getTime())))
  const minW = createMemo(() => Math.min(...all().map(d => d.weight)))
  const maxW = createMemo(() => Math.max(...all().map(d => d.weight)))

  const toXY = (d: ChartPoint) => {
    const dateSpan = maxDate() - minDate() || 1
    const range = maxW() - minW() || 1
    const x = PAD + ((d.date.getTime() - minDate()) / dateSpan) * (W - PAD * 2)
    const y = H - PAD - ((d.weight - minW()) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }

  const extendedPrimary = createMemo(() => {
    const pts = props.primary
    if (pts.length < 1) return pts
    const last = pts[pts.length - 1]
    if (last.date.getTime() < maxDate()) {
      return [...pts, { date: new Date(maxDate()), weight: last.weight }]
    }
    return pts
  })

  const primaryPts = createMemo(() => extendedPrimary().length >= 2 ? extendedPrimary().map(toXY).join(' ') : '')
  const secondaryPts = createMemo(() => (props.secondary?.length ?? 0) >= 2 ? props.secondary!.map(toXY).join(' ') : '')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full h-32">
      <Show when={primaryPts()}>
        <polyline points={primaryPts()} fill="none" stroke="var(--color-accent)" stroke-width="1.5" />
      </Show>
      <Show when={secondaryPts()}>
        <polyline points={secondaryPts()} fill="none" stroke="var(--color-warn)" stroke-width="1.5" stroke-dasharray="4 3" />
      </Show>
    </svg>
  )
}

function HistorySessionRow(props: {
  row: SessionRow
  onExpand: (id: number) => void
  expanded: boolean
  detail: Detail | null
}) {
  const navigate = useNavigate()
  const sid = () => props.row.session.id!
  const dateStr = () => formatDateShort(props.row.session.date)
  const e1rm = () => props.row.amrapWeight && props.row.amrapReps
    ? estimated1RM(props.row.amrapWeight, props.row.amrapReps).toFixed(1)
    : null

  return (
    <div>
      <button
        onClick={() => props.onExpand(sid())}
        class="w-full text-left border border-border px-3 py-2 text-sm flex justify-between hover:border-muted"
      >
        <span class="text-muted">{dateStr()}</span>
        <span class="text-text">{props.row.liftName} W{props.row.session.week}</span>
        <span class="text-muted">
          {props.row.amrapWeight && props.row.amrapReps ? `${props.row.amrapWeight}×${props.row.amrapReps} ~ ${e1rm()}lb` : ''}
        </span>
      </button>
      <Show when={props.expanded ? props.detail : null}>
        {detail => (
          <div class="border border-t-0 border-border px-3 py-2 text-xs text-text-dim space-y-1">
            <div class="flex justify-end mb-1">
              <button
                onClick={() => navigate(`/history/${sid()}/edit`)}
                class="text-xs text-muted hover:text-accent font-mono tracking-widest"
              >
                EDIT →
              </button>
            </div>
            <For each={SET_TYPE_DISPLAY_ORDER.filter(t => detail().sets.some(s => s.type === t))}>
              {type => {
                const typeSets = detail().sets.filter(s => s.type === type)
                return (
                  <Show when={typeSets.length > 0}>
                    <div>
                      <div class="text-muted uppercase tracking-widest mb-0.5">{type}</div>
                      <For each={typeSets}>{s => (
                        <div class="pl-2">
                          {s.weight}lb x {s.reps}
                          <Show when={s.isAmrap && e1rm()}>
                            <span class="text-muted ml-2">est. 1RM: {e1rm()}lb</span>
                          </Show>
                        </div>
                      )}</For>
                    </div>
                  </Show>
                )
              }}
            </For>
            <Show when={detail().accessorySets.length > 0}>
              <For each={[...new Set(detail().accessorySets.map(s => s.exerciseId))]}>
                {exId => {
                  const exSets = detail().accessorySets.filter(s => s.exerciseId === exId)
                  const exName = detail().exerciseNames.get(exId) ?? `Exercise ${exId}`
                  return (
                    <div>
                      <div class="text-muted uppercase tracking-widest mb-0.5">{exName}</div>
                      <For each={exSets}>{s => (
                        <div class="pl-2">
                          <Show when={s.weight != null && s.weight > 0}>{s.weight}lb × </Show>
                          <Show when={s.reps != null}>{s.reps} reps</Show>
                          <Show when={s.duration != null}>
                            {formatDuration(s.duration!)}
                          </Show>
                          <Show when={s.distance != null}>{s.distance} ft</Show>
                        </div>
                      )}</For>
                    </div>
                  )
                }}
              </For>
            </Show>
            <Show when={detail().notes}>
              <div>
                <div class="text-muted uppercase tracking-widest mb-0.5">NOTES</div>
                <div class="pl-2 text-text-dim">{detail().notes}</div>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

export default function History() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = createSignal<ViewMode>('lift')
  const [lifts, setLifts] = createSignal<Lift[]>([])
  const rawLiftId = searchParams.liftId
  const [selectedLiftId, setSelectedLiftId] = createSignal<number | null>(
    rawLiftId ? parseInt(Array.isArray(rawLiftId) ? rawLiftId[0] : rawLiftId, 10) : null
  )
  const [sessions, setSessions] = createSignal<SessionRow[]>([])
  const [tmHistory, setTmHistory] = createSignal<ChartPoint[]>([])
  const [expanded, setExpanded] = createSignal<number | null>(null)
  const [detail, setDetail] = createSignal<Detail | null>(null)

  const [calendarMonth, setCalendarMonth] = createSignal(startOfMonth(new Date()))
  const [monthSessions, setMonthSessions] = createSignal<Session[]>([])
  const [selectedDay, setSelectedDay] = createSignal<Date | null>(null)
  const [selectedDayRows, setSelectedDayRows] = createSignal<SessionRow[]>([])

  const e1rmHistory = createMemo<ChartPoint[]>(() =>
    [...sessions()]
      .reverse()
      .filter(r => r.amrapWeight != null && r.amrapReps != null)
      .map(r => ({
        date: new Date(r.session.date),
        weight: Math.round(estimated1RM(r.amrapWeight!, r.amrapReps!) * 10) / 10,
      }))
  )

  createEffect(() => { void load(mode(), selectedLiftId()) })

  createEffect(() => {
    if (mode() !== 'calendar') return
    void loadMonth(calendarMonth())
  })

  createEffect(() => {
    const day = selectedDay()
    if (!day) { setSelectedDayRows([]); return }
    const k = dateKey(day)
    const ds = monthSessions().filter(s => dateKey(new Date(s.date)) === k)
    void buildRows(ds, lifts()).then(setSelectedDayRows)
  })

  const loadMonth = async (month: Date) => {
    const start = startOfMonth(month)
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999)
    const all = await db.sessions
      .filter(s => {
        const d = new Date(s.date)
        return d >= start && d <= end && s.status === 'completed'
      })
      .toArray()
    setMonthSessions(all)
    setSelectedDay(null)
  }

  const calendarCells = createMemo<CalendarCell[]>(() => {
    const month = calendarMonth()
    const first = startOfMonth(month)
    const startDow = first.getDay()
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7

    const byDay = new Map<string, Session[]>()
    for (const s of monthSessions()) {
      const k = dateKey(new Date(s.date))
      const arr = byDay.get(k) ?? []
      arr.push(s)
      byDay.set(k, arr)
    }

    const cells: CalendarCell[] = []
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startDow + 1
      const date = new Date(month.getFullYear(), month.getMonth(), dayNum)
      cells.push({
        date,
        isCurrentMonth: dayNum >= 1 && dayNum <= daysInMonth,
        sessions: byDay.get(dateKey(date)) ?? [],
      })
    }
    return cells
  })

  const dayCellClass = (cell: CalendarCell) => {
    if (!cell.isCurrentMonth) return 'border border-border-dim text-faint'
    const n = cell.sessions.length
    if (n === 0) return 'border border-border-dim text-muted'
    if (n === 1) return 'border border-accent/40 text-accent bg-accent/10'
    if (n === 2) return 'border border-accent/70 text-accent bg-accent/25'
    return 'border border-accent text-on-accent bg-accent'
  }

  const isToday = (d: Date) => dateKey(d) === dateKey(new Date())
  const isSelected = (d: Date) => {
    const sel = selectedDay()
    return sel != null && dateKey(sel) === dateKey(d)
  }

  const load = async (m: ViewMode, selId: number | null) => {
    const allLifts = await db.lifts.orderBy('order').toArray()
    setLifts(allLifts)
    if (!selId && allLifts.length > 0) {
      const stored = localStorage.getItem(HISTORY_LIFT_KEY)
      setSelectedLiftId(stored ? parseInt(stored, 10) : allLifts[0].id!)
      return
    }

    if (m === 'lift' && selId) {
      const tms = await db.trainingMaxes.where('liftId').equals(selId).sortBy('setAt')
      setTmHistory(tms.map(t => ({ date: new Date(t.setAt), weight: t.weight })))
      const liftSessions = await db.sessions
        .where('liftId').equals(selId)
        .filter(s => s.status === 'completed')
        .toArray()
      liftSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setSessions(await buildRows(liftSessions, allLifts))
    } else if (m === 'date') {
      const allSessions = await db.sessions
        .filter(s => s.status === 'completed')
        .toArray()
      allSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setSessions(await buildRows(allSessions, allLifts))
    }
  }

  const buildRows = async (ss: Session[], allLifts: Lift[]): Promise<SessionRow[]> => {
    if (ss.length === 0) return []
    const sessionIds = ss.map(s => s.id!)
    const amrapSets = await db.sets.where('sessionId').anyOf(sessionIds).filter(s => s.isAmrap).toArray()
    const amrapBySession = new Map(amrapSets.map(s => [s.sessionId, s]))
    return ss.map(s => {
      const lift = allLifts.find(l => l.id === s.liftId)
      const amrap = amrapBySession.get(s.id!)
      return {
        session: s,
        liftName: lift?.name ?? '?',
        amrapWeight: amrap?.weight,
        amrapReps: amrap?.reps ?? undefined,
      }
    })
  }

  const handleExpand = async (sessionId: number) => {
    if (expanded() === sessionId) { setExpanded(null); setDetail(null); return }
    setExpanded(sessionId)
    const [sets, accSets, session] = await Promise.all([
      db.sets.where('sessionId').equals(sessionId).toArray(),
      db.accessorySets.where('sessionId').equals(sessionId).toArray(),
      db.sessions.get(sessionId),
    ])
    let exerciseNames = new Map<number, string>()
    if (accSets.length > 0) {
      const exIds = [...new Set(accSets.map(s => s.exerciseId))]
      const exercises = await db.exercises.where('id').anyOf(exIds).toArray()
      exerciseNames = new Map(exercises.map(e => [e.id!, e.name]))
    }
    setDetail({ sets, accessorySets: accSets, exerciseNames, notes: session?.notes ?? null })
  }

  return (
    <div class="p-4 font-mono">
      <div class="flex gap-0 mb-4 border border-border">
        <For each={['lift', 'date', 'calendar'] as ViewMode[]}>
          {m => (
            <button
              onClick={() => setMode(m)}
              class={`flex-1 py-2 text-xs uppercase tracking-widest ${
                mode() === m ? 'bg-surface-high text-accent' : 'text-muted hover:text-text'
              }`}
            >
              {m === 'calendar' ? 'Calendar' : `By ${m}`}
            </button>
          )}
        </For>
      </div>

      <Show when={mode() === 'lift'}>
        <div class="flex gap-0 mb-4">
          <For each={lifts()}>
            {l => (
              <button
                onClick={() => { setSelectedLiftId(l.id!); localStorage.setItem(HISTORY_LIFT_KEY, String(l.id!)) }}
                class={`flex-1 border py-1 text-xs uppercase tracking-widest ${
                  selectedLiftId() === l.id
                    ? 'border-accent text-accent'
                    : 'border-border text-muted'
                }`}
              >
                {l.name}
              </button>
            )}
          </For>
        </div>
        <Show when={tmHistory().length > 1 || e1rmHistory().length > 1}>
          <div class="mb-4">
            <div class="flex gap-4 text-xs font-mono mb-1">
              <Show when={tmHistory().length > 1}><span class="text-accent">— TM</span></Show>
              <Show when={e1rmHistory().length > 1}><span class="text-warn">- - est. 1RM</span></Show>
            </div>
            <TmChart primary={tmHistory()} secondary={e1rmHistory()} />
          </div>
        </Show>
      </Show>

      <Show when={mode() === 'calendar'}>
        <div class="mb-4">
          <div class="flex items-center justify-between mb-3">
            <button
              onClick={() => setCalendarMonth(m => addMonths(m, -1))}
              class="text-muted hover:text-text px-3 py-1 text-sm font-mono"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span class="text-text uppercase tracking-widest text-sm">{monthLabel(calendarMonth())}</span>
            <button
              onClick={() => setCalendarMonth(m => addMonths(m, 1))}
              class="text-muted hover:text-text px-3 py-1 text-sm font-mono"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div class="grid grid-cols-7 gap-1 mb-1">
            <For each={WEEKDAY_LABELS}>
              {d => <div class="text-center text-muted text-xs font-mono py-1">{d}</div>}
            </For>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <For each={calendarCells()}>
              {cell => (
                <button
                  aria-label={cell.date.toDateString()}
                  onClick={() => cell.isCurrentMonth && setSelectedDay(cell.date)}
                  disabled={!cell.isCurrentMonth}
                  class={`aspect-square flex flex-col items-center justify-center font-mono text-xs ${dayCellClass(cell)} ${isSelected(cell.date) ? 'ring-2 ring-accent' : ''} ${isToday(cell.date) && cell.isCurrentMonth ? 'font-bold' : ''}`}
                >
                  <span>{cell.date.getDate()}</span>
                  <Show when={cell.sessions.length > 0}>
                    <span class="text-[10px] opacity-80">{cell.sessions.length}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={selectedDay() && selectedDayRows().length > 0}>
          <div class="mb-2">
            <div class="text-muted text-xs uppercase tracking-widest mb-2">{formatDateLong(selectedDay()!)}</div>
            <For each={selectedDayRows()}>
              {row => (
                <HistorySessionRow
                  row={row}
                  onExpand={handleExpand}
                  expanded={expanded() === row.session.id}
                  detail={expanded() === row.session.id ? detail() : null}
                />
              )}
            </For>
          </div>
        </Show>
        <Show when={selectedDay() && selectedDayRows().length === 0}>
          <div class="text-muted text-sm">No sessions on this day.</div>
        </Show>
      </Show>

      <Show when={mode() !== 'calendar'}>
        <Show
          when={sessions().length > 0}
          fallback={<div class="text-muted text-sm">No completed sessions yet.</div>}
        >
          <div class="overflow-auto max-h-[60vh]">
            <For each={sessions()}>
              {row => (
                <HistorySessionRow
                  row={row}
                  onExpand={handleExpand}
                  expanded={expanded() === row.session.id}
                  detail={expanded() === row.session.id ? detail() : null}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

import { createSignal, createMemo, createEffect, For, Show } from 'solid-js'
import { useNavigate, useSearchParams } from '@solidjs/router'
import { db } from '../db/index'
import type { Session, Lift, Set as TrainingSet, AccessorySet } from '../types/domain'
import { estimated1RM, formatDuration, SET_TYPE_DISPLAY_ORDER } from '../lib/calc'
import { formatDateShort, formatDateLong } from '../lib/format'
import SectionLabel from '../components/layout/SectionLabel'
import SetReadout from '../components/forms/SetReadout'
import NotesText from '../components/forms/NotesText'

type ViewMode = 'lift' | 'date' | 'calendar'

// One accessory set's value string for SetReadout: reps, else duration, else
// distance (compact "ft"), else empty. Mirrors the main-set "× N" idiom.
const accSetValue = (s: AccessorySet) =>
  s.reps != null ? `${s.reps}`
  : s.duration != null ? formatDuration(s.duration)
  : s.distance != null ? `${s.distance}ft`
  : ''

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
  notesByExercise: Map<number, string>
}

interface ChartPoint { date: Date; weight: number }
interface PlotPoint { x: number; y: number; date: Date; weight: number }
interface ActivePoint { x: number; y: number; label: string; color: string }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

// Catmull-Rom → cubic-bezier conversion so the line reads as a trend rather
// than a jagged connect-the-dots; degenerates to a straight segment for 2 pts.
// Control points are clamped into each segment's own bounding box: a cubic
// bezier is guaranteed to stay within the convex hull of its 4 control
// points, so this keeps a sharp direction change (steep rise into a flat
// plateau, say) from bulging the curve backward past its own endpoints.
function smoothPath(points: PlotPoint[]): string {
  if (points.length === 0) return ''
  if (points.length < 3) return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const [xLo, xHi] = p1.x < p2.x ? [p1.x, p2.x] : [p2.x, p1.x]
    const [yLo, yHi] = p1.y < p2.y ? [p1.y, p2.y] : [p2.y, p1.y]
    const c1x = clamp(p1.x + (p2.x - p0.x) / 6, xLo, xHi)
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, yLo, yHi)
    const c2x = clamp(p2.x - (p3.x - p1.x) / 6, xLo, xHi)
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, yLo, yHi)
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

function TmChart(props: { primary: ChartPoint[]; secondary?: ChartPoint[] }) {
  const W = 400, H = 140
  const PAD_LEFT = 34, PAD_RIGHT = 8, PAD_TOP = 10, PAD_BOTTOM = 22
  const plotW = W - PAD_LEFT - PAD_RIGHT
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const X_TICK_COUNT = 4

  const [active, setActive] = createSignal<ActivePoint | null>(null)

  const all = createMemo(() => [...props.primary, ...(props.secondary ?? [])])
  const minDate = createMemo(() => Math.min(...all().map(d => d.date.getTime())))
  const maxDate = createMemo(() => Math.max(...all().map(d => d.date.getTime())))
  const minW = createMemo(() => Math.min(...all().map(d => d.weight)))
  const maxW = createMemo(() => Math.max(...all().map(d => d.weight)))

  const toXY = (d: ChartPoint): PlotPoint => {
    const dateSpan = maxDate() - minDate() || 1
    const range = maxW() - minW() || 1
    const x = PAD_LEFT + ((d.date.getTime() - minDate()) / dateSpan) * plotW
    const y = PAD_TOP + plotH - ((d.weight - minW()) / range) * plotH
    return { x, y, date: d.date, weight: d.weight }
  }

  const primaryPts = createMemo(() => props.primary.map(toXY))
  const secondaryPts = createMemo(() => (props.secondary ?? []).map(toXY))

  const extendedPrimaryPts = createMemo(() => {
    const pts = primaryPts()
    if (pts.length < 1) return pts
    const last = pts[pts.length - 1]
    if (last.date.getTime() < maxDate()) {
      return [...pts, toXY({ date: new Date(maxDate()), weight: last.weight })]
    }
    return pts
  })

  // Smooth only the real points; the synthetic flat-extension tail is a plain
  // line so it can't drag the curve's tangent into an overshoot dip.
  const primaryPath = createMemo(() => {
    const pts = primaryPts()
    if (pts.length < 2) return ''
    const ext = extendedPrimaryPts()
    const tail = ext.length > pts.length ? ` L ${ext[ext.length - 1].x.toFixed(1)},${ext[ext.length - 1].y.toFixed(1)}` : ''
    return smoothPath(pts) + tail
  })
  const secondaryPath = createMemo(() => secondaryPts().length >= 2 ? smoothPath(secondaryPts()) : '')

  const yTicks = createMemo(() => {
    const lo = minW(), hi = maxW()
    return lo === hi ? [lo] : [lo, (lo + hi) / 2, hi]
  })

  const yTickY = (w: number) => PAD_TOP + plotH - ((w - minW()) / (maxW() - minW() || 1)) * plotH

  const dateLabel = (t: number) => formatDateShort(new Date(t))

  // Recharts-style auto axis: several evenly spaced ticks across the domain,
  // not just the two endpoints. Spans shorter than the tick count in days can
  // format adjacent ticks to the same label — keep the first of each run.
  const xTicks = createMemo(() => {
    const lo = minDate(), hi = maxDate()
    if (all().length === 0) return []
    if (lo === hi) return [lo]
    const ticks = Array.from({ length: X_TICK_COUNT }, (_, i) => lo + (hi - lo) * (i / (X_TICK_COUNT - 1)))
    return ticks.filter((t, i) => i === 0 || dateLabel(t) !== dateLabel(ticks[i - 1]))
  })

  const xTickX = (t: number) => PAD_LEFT + ((t - minDate()) / (maxDate() - minDate() || 1)) * plotW

  const togglePoint = (p: PlotPoint, color: string) => {
    const label = `${dateLabel(p.date.getTime())} · ${p.weight}lb`
    setActive(a => (a && a.x === p.x && a.y === p.y ? null : { x: p.x, y: p.y, label, color }))
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full h-40 select-none">
      <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + plotH} stroke="var(--color-border-dim)" stroke-width="0.5" />
      <line x1={PAD_LEFT} y1={PAD_TOP + plotH} x2={W - PAD_RIGHT} y2={PAD_TOP + plotH} stroke="var(--color-border-dim)" stroke-width="0.5" />

      <For each={yTicks()}>
        {w => (
          <>
            <line x1={PAD_LEFT - 3} y1={yTickY(w)} x2={PAD_LEFT} y2={yTickY(w)} stroke="var(--color-border-dim)" stroke-width="0.5" />
            <text x={PAD_LEFT - 5} y={yTickY(w) + 2.5} text-anchor="end" font-size="7" fill="var(--color-muted)">{Math.round(w)}</text>
          </>
        )}
      </For>

      <For each={xTicks()}>
        {(t, i) => {
          const anchor = i() === 0 ? 'start' : i() === xTicks().length - 1 ? 'end' : 'middle'
          return (
            <>
              <line x1={xTickX(t)} y1={PAD_TOP + plotH} x2={xTickX(t)} y2={PAD_TOP + plotH + 3} stroke="var(--color-border-dim)" stroke-width="0.5" />
              <text x={xTickX(t)} y={H - 6} text-anchor={anchor} font-size="7" fill="var(--color-muted)">{dateLabel(t)}</text>
            </>
          )
        }}
      </For>

      <Show when={primaryPath()}>
        <path d={primaryPath()} fill="none" stroke="var(--color-accent)" stroke-width="1.5" />
      </Show>
      <Show when={secondaryPath()}>
        <path d={secondaryPath()} fill="none" stroke="var(--color-warn)" stroke-width="1.5" stroke-dasharray="4 3" />
      </Show>

      <For each={primaryPts()}>
        {p => <circle cx={p.x} cy={p.y} r="6" fill="transparent" class="cursor-pointer" onClick={() => togglePoint(p, 'var(--color-accent)')} />}
      </For>
      <For each={secondaryPts()}>
        {p => <circle cx={p.x} cy={p.y} r="6" fill="transparent" class="cursor-pointer" onClick={() => togglePoint(p, 'var(--color-warn)')} />}
      </For>

      <Show when={active()}>
        {a => {
          const w = a().label.length * 3.7 + 6
          const tx = Math.min(Math.max(a().x, PAD_LEFT + w / 2), W - PAD_RIGHT - w / 2)
          const ty = a().y < PAD_TOP + 16 ? a().y + 15 : a().y - 8
          return (
            <g pointer-events="none">
              <line x1={a().x} y1={PAD_TOP} x2={a().x} y2={PAD_TOP + plotH} stroke="var(--color-border)" stroke-width="0.5" stroke-dasharray="2 2" />
              <circle cx={a().x} cy={a().y} r="3" fill={a().color} />
              <rect x={tx - w / 2} y={ty - 9} width={w} height="12" fill="var(--color-surface-high)" stroke="var(--color-border)" stroke-width="0.5" />
              <text x={tx} y={ty} text-anchor="middle" font-size="6.5" fill={a().color}>{a().label}</text>
            </g>
          )
        }}
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
                      <SectionLabel class="mb-0.5">{type}</SectionLabel>
                      <For each={typeSets}>{s => (
                        <SetReadout
                          size="sm"
                          alignWeight
                          tone="text-text-dim"
                          class="pl-2"
                          weight={s.weight}
                          value={`${s.reps}`}
                          trailing={
                            <Show when={s.isAmrap && e1rm()}>
                              <span class="text-muted ml-2">est. 1RM: {e1rm()}lb</span>
                            </Show>
                          }
                        />
                      )}</For>
                    </div>
                  </Show>
                )
              }}
            </For>
            <Show when={detail().accessorySets.length > 0 || detail().notesByExercise.size > 0}>
              <For each={[...new Set([
                ...detail().accessorySets.map(s => s.exerciseId),
                ...detail().notesByExercise.keys(),
              ])]}>
                {exId => {
                  const exSets = detail().accessorySets.filter(s => s.exerciseId === exId)
                  const exName = detail().exerciseNames.get(exId) ?? `Exercise ${exId}`
                  const exNote = () => detail().notesByExercise.get(exId)
                  return (
                    <div>
                      <SectionLabel class="mb-0.5">{exName}</SectionLabel>
                      <For each={exSets}>{s => (
                        <SetReadout
                          size="sm"
                          alignWeight
                          tone="text-text-dim"
                          class="pl-2"
                          weight={s.weight != null && s.weight > 0 ? s.weight : null}
                          value={accSetValue(s)}
                        />
                      )}</For>
                      <Show when={exNote()}>
                        <NotesText class="pl-2 text-text-dim" text={exNote()!} />
                      </Show>
                    </div>
                  )
                }}
              </For>
            </Show>
            <Show when={detail().notes}>
              <div>
                <SectionLabel class="mb-0.5">NOTES</SectionLabel>
                <NotesText class="pl-2 text-text-dim" text={detail().notes!} />
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
  const [showArchived, setShowArchived] = createSignal(false)
  // Default the lift filter to active lifts only; archived ones still carry
  // history and can be revealed on demand.
  const visibleLifts = createMemo(() =>
    showArchived() ? lifts() : lifts().filter(l => !l.archived)
  )
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
      const firstActive = allLifts.find(l => !l.archived) ?? allLifts[0]
      setSelectedLiftId(stored ? parseInt(stored, 10) : firstActive.id!)
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
    const [sets, accSets, accNotes, session] = await Promise.all([
      db.sets.where('sessionId').equals(sessionId).toArray(),
      db.accessorySets.where('sessionId').equals(sessionId).toArray(),
      db.accessoryNotes.where('sessionId').equals(sessionId).toArray(),
      db.sessions.get(sessionId),
    ])
    const notesByExercise = new Map(accNotes.map(n => [n.exerciseId, n.notes]))
    let exerciseNames = new Map<number, string>()
    const exIds = [...new Set([...accSets.map(s => s.exerciseId), ...notesByExercise.keys()])]
    if (exIds.length > 0) {
      const exercises = await db.exercises.where('id').anyOf(exIds).toArray()
      exerciseNames = new Map(exercises.map(e => [e.id!, e.name]))
    }
    setDetail({ sets, accessorySets: accSets, exerciseNames, notes: session?.notes ?? null, notesByExercise })
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
          <For each={visibleLifts()}>
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
        <Show when={lifts().some(l => l.archived)}>
          <button
            onClick={() => setShowArchived(v => !v)}
            class="text-muted text-xs uppercase tracking-widest mb-4 hover:text-accent"
          >
            {showArchived() ? '− hide archived' : '+ show archived'}
          </button>
        </Show>
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
                  class={`aspect-square flex flex-col items-center justify-center font-mono text-xs ${dayCellClass(cell)} ${isSelected(cell.date) ? 'ring-2 ring-accent' : ''} ${isToday(cell.date) && cell.isCurrentMonth ? 'font-bold outline outline-2 -outline-offset-2 outline-warn' : ''}`}
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
            <SectionLabel class="mb-2">{formatDateLong(selectedDay()!)}</SectionLabel>
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
          <div>
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

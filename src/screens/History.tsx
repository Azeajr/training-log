import { memo, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { db } from '../db/db-v2'
import type { Session, Lift } from '../db/db-v2'
import { estimated1RM } from '../lib/calc'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type ViewMode = 'lift' | 'date'

interface SessionRow {
  session: Session
  liftName: string
  amrapWeight?: number
  amrapReps?: number
}

interface RowProps {
  row: SessionRow
  onExpand: (id: number) => void
  expanded: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: { sets: any[]; accessorySets: any[]; notes: string | null } | null
}

const HistorySessionRow = memo(function HistorySessionRow({ row, onExpand, expanded, detail }: RowProps) {
  const navigate = useNavigate()
  const sid = row.session.id!
  const dateStr = new Date(row.session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e1rm = row.amrapWeight && row.amrapReps
    ? estimated1RM(row.amrapWeight, row.amrapReps).toFixed(1)
    : null

  return (
    <div>
      <button
        onClick={() => onExpand(sid)}
        className="w-full text-left border border-border px-3 py-2 text-sm flex justify-between hover:border-muted"
      >
        <span className="text-muted">{dateStr}</span>
        <span className="text-text">{row.liftName} W{row.session.week}</span>
        <span className="text-muted">
          {row.amrapWeight && row.amrapReps ? `${row.amrapWeight}×${row.amrapReps} ~ ${e1rm}lb` : ''}
        </span>
      </button>
      {expanded && detail && (
        <div className="border border-t-0 border-border px-3 py-2 text-xs text-text-dim space-y-1">
          <div className="flex justify-end mb-1">
            <button
              onClick={() => navigate(`/history/${sid}/edit`)}
              className="text-xs text-muted hover:text-accent font-mono tracking-widest"
            >
              EDIT →
            </button>
          </div>
          {['warmup', 'main', 'fsl'].map(type => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const typeSets = detail.sets.filter((s: any) => s.type === type)
            if (!typeSets.length) return null
            return (
              <div key={type}>
                <div className="text-muted uppercase tracking-widest mb-0.5">{type}</div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {typeSets.map((s: any, i: number) => (
                  <div key={i} className="pl-2">
                    {s.weight}lb x {s.reps}
                    {s.isAmrap && e1rm && <span className="text-muted ml-2">est. 1RM: {e1rm}lb</span>}
                  </div>
                ))}
              </div>
            )
          })}
          {detail.notes && (
            <div>
              <div className="text-muted uppercase tracking-widest mb-0.5">NOTES</div>
              <div className="pl-2 text-text-dim">{detail.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default function History() {
  const [mode, setMode] = useState<ViewMode>('lift')
  const [lifts, setLifts] = useState<Lift[]>([])
  const [selectedLiftId, setSelectedLiftId] = useState<number | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [tmHistory, setTmHistory] = useState<{ date: string; weight: number }[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detail, setDetail] = useState<{ sets: any[]; accessorySets: any[]; notes: string | null } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [mode, selectedLiftId])

  const load = async () => {
    const allLifts = (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
    setLifts(allLifts)
    if (!selectedLiftId && allLifts.length > 0) setSelectedLiftId(allLifts[0].id!)

    if (mode === 'lift' && (selectedLiftId ?? allLifts[0]?.id)) {
      const liftId = selectedLiftId ?? allLifts[0].id!
      const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
      setTmHistory(tms.map(t => ({
        date: new Date(t.setAt).toLocaleDateString(),
        weight: t.weight,
      })))

      const liftSessions = await db.sessions
        .where('liftId').equals(liftId)
        .filter(s => s.status === 'completed')
        .toArray()
      liftSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setSessions(await buildRows(liftSessions, allLifts))
    } else if (mode === 'date') {
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
    if (expanded === sessionId) { setExpanded(null); setDetail(null); return }
    setExpanded(sessionId)
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
    const accSets = await db.accessorySets.where('sessionId').equals(sessionId).toArray()
    const session = await db.sessions.get(sessionId)
    setDetail({ sets, accessorySets: accSets, notes: session?.notes ?? null })
  }

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 5,
  })

  return (
    <div className="p-4 font-mono">
      <div className="flex gap-0 mb-4 border border-border">
        {(['lift', 'date'] as ViewMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 text-xs uppercase tracking-widest ${
              mode === m ? 'bg-surface-high text-accent' : 'text-muted hover:text-text'
            }`}
          >
            By {m}
          </button>
        ))}
      </div>

      {mode === 'lift' && (
        <>
          <div className="flex gap-0 mb-4">
            {lifts.map(l => (
              <button
                key={l.id}
                onClick={() => setSelectedLiftId(l.id!)}
                className={`flex-1 border py-1 text-xs uppercase tracking-widest ${
                  selectedLiftId === l.id
                    ? 'border-accent text-accent'
                    : 'border-border text-muted'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
          {tmHistory.length > 1 && (
            <div className="mb-4 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tmHistory}>
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontFamily: 'monospace' }}
                    labelStyle={{ color: '#71717a' }}
                    itemStyle={{ color: '#4ade80' }}
                  />
                  <Line type="monotone" dataKey="weight" stroke="#4ade80" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {sessions.length === 0 ? (
        <div className="text-muted text-sm">No completed sessions yet.</div>
      ) : (
        <div ref={scrollRef} className="overflow-auto max-h-[60vh]">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vItem => (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
              >
                <HistorySessionRow
                  row={sessions[vItem.index]}
                  onExpand={handleExpand}
                  expanded={expanded === sessions[vItem.index].session.id}
                  detail={expanded === sessions[vItem.index].session.id ? detail : null}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Session, Lift } from '../db/db'
import { estimated1RM } from '../lib/calc'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type ViewMode = 'lift' | 'date'

interface SessionRow {
  session: Session
  liftName: string
  amrapWeight?: number
  amrapReps?: number
}

export default function History() {
  const [mode, setMode] = useState<ViewMode>('lift')
  const [lifts, setLifts] = useState<Lift[]>([])
  const [selectedLiftId, setSelectedLiftId] = useState<number | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [tmHistory, setTmHistory] = useState<{ date: string; weight: number }[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [detail, setDetail] = useState<{ sets: any[]; accessorySets: any[]; notes: string | null } | null>(null)

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
      const rows = await buildRows(liftSessions, allLifts)
      setSessions(rows)
    } else if (mode === 'date') {
      const allSessions = await db.sessions
        .filter(s => s.status === 'completed')
        .toArray()
      allSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const rows = await buildRows(allSessions, allLifts)
      setSessions(rows)
    }
  }

  const buildRows = async (ss: Session[], allLifts: Lift[]): Promise<SessionRow[]> => {
    const rows: SessionRow[] = []
    for (const s of ss) {
      const lift = allLifts.find(l => l.id === s.liftId)
      const amrap = s.id
        ? await db.sets.where('sessionId').equals(s.id).filter(st => st.isAmrap).first()
        : undefined
      rows.push({
        session: s,
        liftName: lift?.name ?? '?',
        amrapWeight: amrap?.weight,
        amrapReps: amrap?.reps,
      })
    }
    return rows
  }

  const handleExpand = async (sessionId: number) => {
    if (expanded === sessionId) { setExpanded(null); setDetail(null); return }
    setExpanded(sessionId)
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
    const accSets = await db.accessorySets.where('sessionId').equals(sessionId).toArray()
    const session = await db.sessions.get(sessionId)
    setDetail({ sets, accessorySets: accSets, notes: session?.notes ?? null })
  }

  return (
    <div className="p-4 font-mono">
      <div className="flex gap-0 mb-4 border border-zinc-700">
        {(['lift', 'date'] as ViewMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 text-xs uppercase tracking-widest ${
              mode === m ? 'bg-zinc-800 text-green-400' : 'text-zinc-500 hover:text-zinc-100'
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
                    ? 'border-green-400 text-green-400'
                    : 'border-zinc-700 text-zinc-500'
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

      <div className="space-y-1">
        {sessions.map(row => {
          const sid = row.session.id!
          const dateStr = new Date(row.session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const e1rm = row.amrapWeight && row.amrapReps
            ? estimated1RM(row.amrapWeight, row.amrapReps).toFixed(1)
            : null
          return (
            <div key={sid}>
              <button
                onClick={() => handleExpand(sid)}
                className="w-full text-left border border-zinc-700 px-3 py-2 text-sm flex justify-between hover:border-zinc-500"
              >
                <span className="text-zinc-500">{dateStr}</span>
                <span className="text-zinc-100">{row.liftName} W{row.session.week}</span>
                <span className="text-zinc-500">
                  {row.amrapWeight && row.amrapReps
                    ? `${row.amrapWeight}×${row.amrapReps} ~ ${e1rm}lb`
                    : ''}
                </span>
              </button>
              {expanded === sid && detail && (
                <div className="border border-t-0 border-zinc-700 px-3 py-2 text-xs text-zinc-400 space-y-1">
                  {['warmup', 'main', 'fsl'].map(type => {
                    const typeSets = detail.sets.filter(s => s.type === type)
                    if (!typeSets.length) return null
                    return (
                      <div key={type}>
                        <div className="text-zinc-500 uppercase tracking-widest mb-0.5">{type}</div>
                        {typeSets.map((s: any, i: number) => (
                          <div key={i} className="pl-2">
                            {s.weight}lb x {s.reps}
                            {s.isAmrap && e1rm && <span className="text-zinc-500 ml-2">est. 1RM: {e1rm}lb</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {detail.notes && (
                    <div>
                      <div className="text-zinc-500 uppercase tracking-widest mb-0.5">NOTES</div>
                      <div className="pl-2 text-zinc-400">{detail.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {sessions.length === 0 && (
          <div className="text-zinc-600 text-sm">No completed sessions yet.</div>
        )}
      </div>
    </div>
  )
}

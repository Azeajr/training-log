import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Lift, Session } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'
import { calcMainSets, calcFslSets, calcWarmup } from '../lib/calc'
import { getNextSession } from '../lib/session'
import SessionPreview from '../components/SessionPreview'
import Rule from '../components/Rule'

interface WeekStatus {
  liftId: number
  name: string
  status: 'pending' | 'completed' | 'skipped' | 'suggested'
}

export default function Today() {
  const navigate = useNavigate()
  const startSession = useWorkoutStore(s => s.startSession)
  const clearSession = useWorkoutStore(s => s.clearSession)
  const activeSession = useWorkoutStore(s => s.activeSession)

  const [loading, setLoading] = useState(true)
  const [lifts, setLifts] = useState<Lift[]>([])
  const [weekStatuses, setWeekStatuses] = useState<WeekStatus[]>([])
  const [selectedLiftId, setSelectedLiftId] = useState<number | null>(null)
  const [currentWeek, setCurrentWeek] = useState<1 | 2 | 3 | 4>(1)
  const [currentCycleId, setCurrentCycleId] = useState<number>(1)
  const [tm, setTm] = useState(0)
  const [liftType, setLiftType] = useState<'upper' | 'lower'>('upper')
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const next = await getNextSession()
    const allLifts = (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
    setLifts(allLifts)
    setCurrentWeek(next.week)
    setCurrentCycleId(next.cycleId)
    setSelectedLiftId(next.liftId)

    const sessions = await db.sessions
      .where('cycleId').equals(next.cycleId)
      .toArray()

    const statuses: WeekStatus[] = allLifts.map(l => {
      const s = sessions.find(se => se.liftId === l.id && se.week === next.week)
      return {
        liftId: l.id!,
        name: l.name,
        status: s ? s.status : 'pending',
      }
    })
    setWeekStatuses(statuses)

    const currentTms = await db.trainingMaxes
      .where('liftId').equals(next.liftId)
      .sortBy('setAt')
    const latestTm = currentTms[currentTms.length - 1]
    if (latestTm) setTm(latestTm.weight)

    const lift = allLifts.find(l => l.id === next.liftId)
    if (lift) setLiftType(lift.liftType)

    setLoading(false)
  }

  const handleSelectLift = async (liftId: number) => {
    setSelectedLiftId(liftId)
    const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
    const latest = tms[tms.length - 1]
    if (latest) setTm(latest.weight)
    const lift = lifts.find(l => l.id === liftId)
    if (lift) setLiftType(lift.liftType)
  }

  const launchSession = async () => {
    if (!selectedLiftId) return
    const existing = await db.sessions
      .where('cycleId').equals(currentCycleId)
      .filter(s => s.liftId === selectedLiftId && s.week === currentWeek && s.status === 'pending')
      .first()

    let session: Session
    if (existing) {
      session = existing
    } else {
      const id = await db.sessions.add({
        cycleId: currentCycleId,
        liftId: selectedLiftId,
        week: currentWeek,
        date: new Date(),
        notes: null,
        status: 'pending',
      })
      session = await db.sessions.get(id) as Session
    }
    startSession(session)
    navigate('/workout')
  }

  const handleStart = () => {
    if (!selectedLiftId) return
    if (activeSession && activeSession.liftId === selectedLiftId) {
      navigate('/workout')
      return
    }
    if (activeSession) {
      setShowAbandonConfirm(true)
      return
    }
    launchSession()
  }

  const handleAbandonAndStart = () => {
    clearSession()
    setShowAbandonConfirm(false)
    launchSession()
  }

  if (loading) return null

  const selectedLift = lifts.find(l => l.id === selectedLiftId)
  const main = selectedLift ? calcMainSets(tm, currentWeek) : []
  const fsl = selectedLift ? calcFslSets(tm) : []
  const warmup = selectedLift ? calcWarmup(tm, main[0]?.weight ?? tm, liftType, main[0]?.reps ?? 5) : []
  const activeLiftName = lifts.find(l => l.id === activeSession?.liftId)?.name ?? ''

  const statusLabel = (ws: WeekStatus) => {
    if (ws.liftId === selectedLiftId) return '->'
    if (ws.status === 'completed') return 'done'
    if (ws.status === 'skipped') return 'skip'
    return ''
  }

  return (
    <div className="p-4 md:p-8 font-mono max-w-5xl mx-auto">
      {activeSession && (
        <Link
          to="/workout"
          className="block border border-warn text-warn px-4 py-3 text-xs tracking-widest uppercase mb-6"
        >
          &#9654; SESSION IN PROGRESS — RESUME
        </Link>
      )}

      <div className="md:grid md:grid-cols-2 md:gap-12 md:items-start">
        {/* Left: week header + lift picker */}
        <div>
          <Rule
            label={`WEEK ${currentWeek}${currentWeek === 4 ? ' . DELOAD' : ''}`}
            className={`mb-4 ${currentWeek === 4 ? 'text-blue-400' : 'text-muted'}`}
          />

          <div className="flex gap-2 mb-6 flex-wrap">
            {weekStatuses.map(ws => (
              <button
                key={ws.liftId}
                onClick={() => handleSelectLift(ws.liftId)}
                className={`border px-3 py-2 text-xs tracking-widest ${
                  ws.liftId === selectedLiftId
                    ? 'border-warn text-warn'
                    : ws.status === 'completed'
                    ? 'border-accent text-accent'
                    : ws.status === 'skipped'
                    ? 'border-danger text-danger'
                    : 'border-border text-muted hover:border-text hover:text-text'
                }`}
              >
                {ws.name} {statusLabel(ws)}
              </button>
            ))}
          </div>
        </div>

        {/* Right: session preview + start */}
        <div>
          {selectedLift && (
            <>
              <Rule label={`${selectedLift.name} . TODAY`} className="text-muted mb-4" />
              <SessionPreview warmup={warmup} main={main} fsl={fsl} />
              <button
                onClick={handleStart}
                className="mt-6 border border-accent text-accent px-6 py-4 font-mono w-full tracking-widest text-sm"
              >
                START WORKOUT
              </button>
            </>
          )}
        </div>
      </div>

      {showAbandonConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border p-6 font-mono max-w-sm w-full">
            <div className="text-text uppercase tracking-widest text-sm mb-2">
              ABANDON SESSION?
            </div>
            <div className="text-muted text-xs mb-6">
              Your {activeLiftName} session is unfinished. Starting a new lift will discard it.
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAbandonAndStart}
                className="flex-1 border border-danger text-danger py-3 text-xs tracking-widest font-mono"
              >
                ABANDON
              </button>
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="flex-1 border border-border text-muted py-3 text-xs tracking-widest font-mono"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

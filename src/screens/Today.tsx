import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Lift, Session } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'
import { calcMainSets, calcFslSets, calcWarmup } from '../lib/calc'
import { getNextSession } from '../lib/session'
import SessionPreview from '../components/SessionPreview'

interface WeekStatus {
  liftId: number
  name: string
  status: 'pending' | 'completed' | 'skipped' | 'suggested'
}

export default function Today() {
  const navigate = useNavigate()
  const startSession = useWorkoutStore(s => s.startSession)
  const activeSession = useWorkoutStore(s => s.activeSession)

  const [loading, setLoading] = useState(true)
  const [lifts, setLifts] = useState<Lift[]>([])
  const [weekStatuses, setWeekStatuses] = useState<WeekStatus[]>([])
  const [selectedLiftId, setSelectedLiftId] = useState<number | null>(null)
  const [currentWeek, setCurrentWeek] = useState<1 | 2 | 3 | 4>(1)
  const [currentCycleId, setCurrentCycleId] = useState<number>(1)
  const [tm, setTm] = useState(0)
  const [liftType, setLiftType] = useState<'upper' | 'lower'>('upper')

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

  const handleStart = async () => {
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

  if (loading) return null

  const selectedLift = lifts.find(l => l.id === selectedLiftId)
  const main = selectedLift ? calcMainSets(tm, currentWeek) : []
  const fsl = selectedLift ? calcFslSets(tm) : []
  const warmup = selectedLift ? calcWarmup(tm, main[0]?.weight ?? tm, liftType) : []

  const statusLabel = (ws: WeekStatus) => {
    if (ws.liftId === selectedLiftId) return '->'
    if (ws.status === 'completed') return 'done'
    if (ws.status === 'skipped') return 'skip'
    return ''
  }

  return (
    <div className="p-4 font-mono">
      {activeSession && (
        <Link
          to="/workout"
          className="block border border-amber-400 text-amber-400 px-4 py-2 text-xs tracking-widest uppercase mb-4"
        >
          &#9654; SESSION IN PROGRESS — RESUME
        </Link>
      )}
      <div className="text-zinc-500 uppercase text-xs tracking-widest mb-4">
        --- WEEK {currentWeek} ----------------------------------------
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {weekStatuses.map(ws => (
          <button
            key={ws.liftId}
            onClick={() => handleSelectLift(ws.liftId)}
            className={`border px-3 py-1 text-xs tracking-widest ${
              ws.liftId === selectedLiftId
                ? 'border-amber-400 text-amber-400'
                : ws.status === 'completed'
                ? 'border-green-400 text-green-400'
                : ws.status === 'skipped'
                ? 'border-red-400 text-red-400'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-100 hover:text-zinc-100'
            }`}
          >
            {ws.name} {statusLabel(ws)}
          </button>
        ))}
      </div>

      {selectedLift && (
        <>
          <div className="text-zinc-500 uppercase text-xs tracking-widest mb-4">
            --- {selectedLift.name} . TODAY ---------------------------------
          </div>
          <SessionPreview warmup={warmup} main={main} fsl={fsl} />
          <button
            onClick={handleStart}
            className="mt-8 border border-green-400 text-green-400 px-6 py-2 font-mono w-full tracking-widest"
          >
            START WORKOUT
          </button>
        </>
      )}
    </div>
  )
}

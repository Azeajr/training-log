import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Lift, Exercise } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'
import {
  calcMainSets,
  calcFslSets,
  calcWarmup,
  calcAmrapTargets,
  targetReps,
} from '../lib/calc'
import type { AmrapTarget, MainSet, FslSet, WarmupSet } from '../lib/calc'
import type { RestType } from '../store/workoutStore'
import { getAmrapTargets } from '../lib/session'
import SetRow from '../components/SetRow'
import AccessoryPicker from '../components/AccessoryPicker'
import AccessoryLog from '../components/AccessoryLog'
import RestTimer from '../components/RestTimer'
import Rule from '../components/Rule'

export default function Workout() {
  const navigate = useNavigate()
  const {
    activeSession,
    loggedSets,
    currentSetIndex,
    activeAccessories,
    notes,
    logSet,
    editSet,
    advanceSet,
    startRest,
    clearSession,
    setNotes,
  } = useWorkoutStore()
  const [lift, setLift] = useState<Lift | null>(null)
  const [allSets, setAllSets] = useState<(WarmupSet | MainSet | FslSet)[]>([])
  const [amrapTargets, setAmrapTargets] = useState<AmrapTarget[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [skipConfirm, setSkipConfirm] = useState(false)
  const [exitConfirm, setExitConfirm] = useState(false)

  useEffect(() => {
    if (!activeSession) return
    loadData()
  }, [activeSession])

  const loadData = async () => {
    if (!activeSession) return
    const l = await db.lifts.get(activeSession.liftId)
    if (!l) return
    setLift(l)

    const tms = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
    const latestTm = tms[tms.length - 1]
    if (!latestTm) return
    const tmWeight = latestTm.weight

    const main = calcMainSets(tmWeight, activeSession.week)
    const fsl = calcFslSets(tmWeight)
    const warmup = calcWarmup(tmWeight, main[0].weight, l.liftType)
    setAllSets([...warmup, ...main, ...fsl])

    if (activeSession.week !== 4) {
      const amrapSet = main.find(s => s.isAmrap)
      if (amrapSet) {
        const prevSets = await getAmrapTargets(
          activeSession.liftId,
          activeSession.week,
          activeSession.cycleId
        )
        if (prevSets.length > 0) {
          setAmrapTargets(calcAmrapTargets(prevSets, amrapSet.weight))
        } else {
          // No history — derive goal from TM (TM ≈ 90% of true 1RM)
          const est1RM = tmWeight / 0.9
          setAmrapTargets([{
            label: 'goal',
            reps: targetReps(est1RM, amrapSet.weight),
            est1RM: Math.round(est1RM),
          }])
        }
      }
    }

    const allExercises = await db.exercises.toArray()
    setExercises(allExercises)
  }

  const handleLog = (setIndex: number, reps: number) => {
    const s = allSets[setIndex]
    const setData = {
      sessionId: activeSession!.id!,
      type: s.type,
      setNumber: s.setNumber,
      weight: s.weight,
      reps,
      isAmrap: (s as MainSet).isAmrap ?? false,
    }
    logSet(setData)
    advanceSet()
    db.sets.add(setData).then(dbId => editSet(setIndex, { id: dbId }))

    const nextS = allSets[setIndex + 1]
    let restType: RestType
    if (reps < s.reps) {
      restType = 'fail'
    } else if (!nextS || nextS.type !== s.type) {
      restType = 'transition'
    } else {
      restType = 'normal'
    }
    startRest(restType)
  }

  const handleEdit = (setIndex: number, reps: number) => {
    editSet(setIndex, { reps })
    const dbId = loggedSets[setIndex]?.id
    if (dbId) db.sets.update(dbId, { reps })
  }

  const handleComplete = async () => {
    if (!activeSession?.id) return
    await db.sessions.update(activeSession.id, { status: 'completed', notes })
    for (const acc of activeAccessories) {
      for (const s of acc.loggedSets) {
        if (s.setNumber != null) {
          await db.accessorySets.add({
            sessionId: activeSession.id,
            exerciseId: acc.exerciseId,
            setNumber: s.setNumber,
            weight: s.weight ?? null,
            reps: s.reps ?? null,
            duration: s.duration ?? null,
            distance: s.distance ?? null,
          })
        }
      }
    }
    await checkWeekAdvancement()
    clearSession()
    navigate('/today')
  }

  const handleExit = async () => {
    if (!activeSession?.id) return
    await db.sets.where('sessionId').equals(activeSession.id).delete()
    await db.accessorySets.where('sessionId').equals(activeSession.id).delete()
    clearSession()
    navigate('/today')
  }

  const handleSkip = async () => {
    if (!activeSession?.id) return
    await db.sessions.update(activeSession.id, { status: 'skipped' })
    await checkWeekAdvancement()
    clearSession()
    navigate('/today')
  }

  const checkWeekAdvancement = async () => {}

  if (!activeSession) {
    return (
      <div className="p-6 font-mono text-muted">
        No active session. Go to <span className="text-accent">TODAY</span> to start one.
      </div>
    )
  }

  const liftName = lift?.name ?? '...'
  const warmupSets = allSets.filter(s => s.type === 'warmup') as WarmupSet[]
  const mainSets = allSets.filter(s => s.type === 'main') as MainSet[]
  const fslSets = allSets.filter(s => s.type === 'fsl') as FslSet[]
  const warmupCount = warmupSets.length
  const mainCount = mainSets.length

  return (
    <div className="p-4 md:p-8 font-mono pb-48 max-w-3xl mx-auto">
      <Rule
        label={`${liftName} . WEEK ${activeSession.week}${activeSession.week === 4 ? ' . DELOAD' : ''}`}
        className={`mb-6 ${activeSession.week === 4 ? 'text-blue-400' : 'text-muted'}`}
      />

      {/* Sets: single column on mobile, two-column on desktop */}
      <div className="md:grid md:grid-cols-[2fr_3fr] md:gap-10 md:items-start">

        {/* Left column on desktop (secondary sets) / top on mobile */}
        <div>
          <div className="mb-6">
            <div className="text-muted uppercase text-xs tracking-widest mb-2">WARM UP</div>
            {warmupSets.map((s, i) => (
              <SetRow
                key={i}
                set={{ ...s, isAmrap: false }}
                isActive={currentSetIndex === i}
                isCompleted={i < currentSetIndex}
                loggedReps={loggedSets[i]?.reps}
                onLog={(reps) => handleLog(i, reps)}
                onEdit={(reps) => handleEdit(i, reps)}
              />
            ))}
          </div>

          <div className="mb-6 md:mb-0">
            <div className="text-muted uppercase text-xs tracking-widest mb-2">FSL  5 x 10</div>
            {fslSets.map((s, i) => {
              const globalIdx = warmupCount + mainCount + i
              return (
                <SetRow
                  key={i}
                  set={{ ...s, isAmrap: false }}
                  isActive={currentSetIndex === globalIdx}
                  isCompleted={globalIdx < currentSetIndex}
                  loggedReps={loggedSets[globalIdx]?.reps}
                  onLog={(reps) => handleLog(globalIdx, reps)}
                  onEdit={(reps) => handleEdit(globalIdx, reps)}
                />
              )
            })}
          </div>
        </div>

        {/* Right column on desktop (main work + accessories + actions) */}
        <div>
          <div className="mb-6">
            <div className="text-muted uppercase text-xs tracking-widest mb-2">MAIN</div>
            {mainSets.map((s, i) => {
              const globalIdx = warmupCount + i
              return (
                <SetRow
                  key={i}
                  set={s}
                  isActive={currentSetIndex === globalIdx}
                  isCompleted={globalIdx < currentSetIndex}
                  loggedReps={loggedSets[globalIdx]?.reps}
                  amrapTargets={s.isAmrap ? amrapTargets : undefined}
                  onLog={(reps) => handleLog(globalIdx, reps)}
                  onEdit={(reps) => handleEdit(globalIdx, reps)}
                />
              )
            })}
          </div>

          {activeAccessories.length > 0 && (
            <div className="mb-4">
              <Rule label="ACCESSORIES" className="text-muted mb-2" />
              {activeAccessories.map(acc => (
                <AccessoryLog
                  key={acc.exerciseId}
                  accessory={acc}
                  exercise={exercises.find(e => e.id === acc.exerciseId)}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => setShowPicker(true)}
            className="w-full border border-border py-3 text-muted text-xs tracking-widest hover:border-accent hover:text-accent mb-6"
          >
            + SELECT ASSISTANCE EXERCISE
          </button>

          <div className="mb-6">
            <Rule label="NOTES" className="text-muted mb-2" />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-surface border border-border text-text font-mono px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none"
              rows={3}
              placeholder="Session notes..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleComplete}
              className="flex-1 border border-accent text-accent py-4 font-mono text-sm tracking-widest"
            >
              COMPLETE SESSION
            </button>
            {!skipConfirm ? (
              <button
                onClick={() => setSkipConfirm(true)}
                className="border border-danger text-danger px-5 py-4 font-mono text-sm"
              >
                SKIP LIFT
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSkip}
                  className="border border-danger text-danger px-3 py-4 font-mono text-xs tracking-widest"
                >
                  CONFIRM SKIP
                </button>
                <button
                  onClick={() => setSkipConfirm(false)}
                  className="border border-border text-muted px-3 py-4 font-mono text-xs"
                >
                  CANCEL
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-3">
            {!exitConfirm ? (
              <button
                onClick={() => setExitConfirm(true)}
                className="text-muted hover:text-text-dim font-mono text-xs tracking-widest"
              >
                EXIT WITHOUT SAVING
              </button>
            ) : (
              <div className="flex gap-3 items-center">
                <span className="text-muted text-xs">discard this attempt?</span>
                <button
                  onClick={handleExit}
                  className="border border-muted text-text-dim px-3 py-1 font-mono text-xs tracking-widest"
                >
                  CONFIRM EXIT
                </button>
                <button
                  onClick={() => setExitConfirm(false)}
                  className="text-muted font-mono text-xs"
                >
                  cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPicker && lift && (
        <AccessoryPicker liftId={lift.id!} onClose={() => { setShowPicker(false); loadData() }} />
      )}

      <RestTimer />
    </div>
  )
}

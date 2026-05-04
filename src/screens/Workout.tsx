import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Lift, Exercise } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'
import {
  calcMainSets,
  calcFslSets,
  calcWarmup,
  calcAmrapTargets,
  calcJokerSet,
  calcJokerIncrement,
  calcNextJokerWeight,
  shouldShowJokerButton,
  targetReps,
  JOKER_MIN_REPS,
} from '../lib/calc'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet } from '../lib/calc'
import type { RestType } from '../store/workoutStore'
import { getAmrapTargets, advanceCycleIfComplete } from '../lib/session'
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
    deleteLastSet,
    startRest,
    clearSession,
    setNotes,
  } = useWorkoutStore()
  const [lift, setLift] = useState<Lift | null>(null)
  const [allSets, setAllSets] = useState<(WarmupSet | MainSet | FslSet | JokerSet)[]>([])
  const [jokerSets, setJokerSets] = useState<JokerSet[]>([])
  const [amrapTargets, setAmrapTargets] = useState<AmrapTarget[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [skipConfirm, setSkipConfirm] = useState(false)
  const [exitConfirm, setExitConfirm] = useState(false)
  const [cycleCompleteData, setCycleCompleteData] = useState<Array<{ liftName: string; weight: number }> | null>(null)
  const prevAmrapSetsRef = useRef<Array<{ weight: number; reps: number; label: string }>>([])
  const tmWeightRef = useRef<number>(0)

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
    tmWeightRef.current = tmWeight

    const main = calcMainSets(tmWeight, activeSession.week)
    const freshLoggedSets = useWorkoutStore.getState().loggedSets
    const loggedFsl = freshLoggedSets.filter(s => s.type === 'fsl')
    const fslOverride = loggedFsl.length > 0 ? loggedFsl[loggedFsl.length - 1].weight : null
    const fsl = calcFslSets(tmWeight).map((s, i) =>
      fslOverride !== null && i >= loggedFsl.length ? { ...s, weight: fslOverride } : s
    )
    const warmup = calcWarmup(tmWeight, main[0].weight, l.liftType)
    const restoredJokers: JokerSet[] = freshLoggedSets
      .filter(s => s.type === 'joker')
      .map((s, i) => ({ type: 'joker' as const, setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false as const }))
    setJokerSets(restoredJokers)
    setAllSets([...warmup, ...main, ...restoredJokers, ...fsl])

    if (activeSession.week !== 4) {
      const amrapSet = main.find(s => s.isAmrap)
      if (amrapSet) {
        const prevSets = await getAmrapTargets(
          activeSession.liftId,
          activeSession.week,
          activeSession.cycleId
        )
        if (prevSets.length > 0) {
          prevAmrapSetsRef.current = prevSets
          setAmrapTargets(calcAmrapTargets(prevSets, amrapSet.weight))
        } else {
          prevAmrapSetsRef.current = []
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

  const handleAmrapWeightChange = (weight: number) => {
    if (prevAmrapSetsRef.current.length > 0) {
      setAmrapTargets(calcAmrapTargets(prevAmrapSetsRef.current, weight))
    } else if (tmWeightRef.current > 0) {
      const est1RM = tmWeightRef.current / 0.9
      setAmrapTargets([{
        label: 'goal',
        reps: targetReps(est1RM, weight),
        est1RM: Math.round(est1RM),
      }])
    }
  }

  const handleDeleteSet = async () => {
    const lastSet = loggedSets[loggedSets.length - 1]
    if (!lastSet) return
    if (lastSet.id) await db.sets.delete(lastSet.id)
    if (lastSet.type === 'joker') {
      const updatedJokers = jokerSets.slice(0, -1)
      setJokerSets(updatedJokers)
      setAllSets(prev => {
        const w = prev.filter(s => s.type === 'warmup') as WarmupSet[]
        const m = prev.filter(s => s.type === 'main') as MainSet[]
        const f = prev.filter(s => s.type === 'fsl') as FslSet[]
        return [...w, ...m, ...updatedJokers, ...f]
      })
    }
    deleteLastSet()
    loadData()
  }

  const handleLog = (setIndex: number, reps: number, weight: number) => {
    const s = allSets[setIndex]
    const setData = {
      sessionId: activeSession!.id!,
      type: s.type,
      setNumber: s.setNumber,
      weight,
      reps,
      isAmrap: (s as MainSet).isAmrap ?? false,
    }
    logSet(setData)
    advanceSet()
    db.sets.add(setData).then(dbId => editSet(setIndex, { id: dbId }))

    if (s.type === 'fsl' && weight !== s.weight) {
      setAllSets(prev => prev.map((ps, idx) =>
        ps.type === 'fsl' && idx > setIndex ? { ...ps, weight } : ps
      ))
    }

    if (s.type === 'main' && s.setNumber === 1 && weight !== s.weight) {
      setAllSets(prev => prev.map(ps =>
        ps.type === 'fsl' ? { ...ps, weight } : ps
      ))
    }

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

  const handleEdit = (setIndex: number, reps: number, weight: number) => {
    editSet(setIndex, { reps, weight })
    const dbId = loggedSets[setIndex]?.id
    if (dbId) db.sets.update(dbId, { reps, weight })
  }

  const handleAddJoker = () => {
    const amrapSet = allSets.find(s => s.type === 'main' && (s as MainSet).isAmrap) as MainSet | undefined
    const amrapIdx = amrapSet ? allSets.indexOf(amrapSet) : -1
    const loggedAmrapReps = amrapIdx >= 0 ? (loggedSets[amrapIdx]?.reps ?? 0) : 0
    const weekGoalReps = JOKER_MIN_REPS[activeSession!.week] ?? 1
    const increment = calcJokerIncrement(loggedAmrapReps, weekGoalReps)
    const lastWeight = jokerSets.length > 0 ? jokerSets[jokerSets.length - 1].weight : (amrapSet?.weight ?? 0)
    const jokerReps = ({ 1: 5, 2: 3, 3: 1 } as Record<number, number>)[activeSession!.week] ?? 5
    const newJoker = calcJokerSet(lastWeight, jokerSets.length + 1, jokerReps, increment)
    const updatedJokers = [...jokerSets, newJoker]
    setJokerSets(updatedJokers)
    setAllSets(prev => {
      const w = prev.filter(s => s.type === 'warmup') as WarmupSet[]
      const m = prev.filter(s => s.type === 'main') as MainSet[]
      const f = prev.filter(s => s.type === 'fsl') as FslSet[]
      return [...w, ...m, ...updatedJokers, ...f]
    })
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
    const advanced = await checkWeekAdvancement()
    if (!advanced) {
      clearSession()
      navigate('/today')
    }
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
    const advanced = await checkWeekAdvancement()
    if (!advanced) {
      clearSession()
      navigate('/today')
    }
  }

  const checkWeekAdvancement = async (): Promise<boolean> => {
    const { advanced, newTms } = await advanceCycleIfComplete()
    if (advanced) setCycleCompleteData(newTms)
    return advanced
  }

  const handleCycleCompleteDismiss = () => {
    setCycleCompleteData(null)
    clearSession()
    navigate('/today')
  }

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
  const jokerSetsRendered = allSets.filter(s => s.type === 'joker') as JokerSet[]
  const fslSets = allSets.filter(s => s.type === 'fsl') as FslSet[]
  const warmupCount = warmupSets.length
  const mainCount = mainSets.length
  const jokerCount = jokerSetsRendered.length

  const showJokerButton = shouldShowJokerButton({
    week: activeSession.week,
    loggedSets,
    warmupCount,
    mainCount,
    jokerCount,
  })

  const amrapSet = mainSets.find(s => s.isAmrap)
  const amrapIdx = amrapSet ? allSets.indexOf(amrapSet) : -1
  const loggedAmrapReps = amrapIdx >= 0 ? (loggedSets[amrapIdx]?.reps ?? 0) : 0
  const jokerIncrement = calcJokerIncrement(loggedAmrapReps, JOKER_MIN_REPS[activeSession.week] ?? 1)
  const lastJokerWeight = jokerCount > 0 ? jokerSetsRendered[jokerCount - 1].weight : (amrapSet?.weight ?? 0)
  const nextJokerWeight = calcNextJokerWeight(lastJokerWeight, jokerIncrement)

  return (
    <div className="p-4 md:p-8 font-mono pb-48 max-w-3xl mx-auto">
      <Rule
        label={`${liftName} . WEEK ${activeSession.week}${activeSession.week === 4 ? ' . DELOAD' : ''}`}
        className={`mb-6 ${activeSession.week === 4 ? 'text-blue-400' : 'text-muted'}`}
      />

      <div className="md:grid md:grid-cols-3 md:gap-8 md:items-start mb-6">

        {/* Col 1: Warm Up */}
        <div className="mb-6 md:mb-0">
          <div className="text-muted uppercase text-xs tracking-widest mb-2">WARM UP</div>
          {warmupSets.map((s, i) => (
            <SetRow
              key={i}
              set={{ ...s, isAmrap: false }}
              isActive={currentSetIndex === i}
              isCompleted={i < currentSetIndex}
              loggedReps={loggedSets[i]?.reps}
              loggedWeight={loggedSets[i]?.weight}
              onLog={(reps, weight) => handleLog(i, reps, weight)}
              onEdit={(reps, weight) => handleEdit(i, reps, weight)}
              onDelete={i === currentSetIndex - 1 ? handleDeleteSet : undefined}
            />
          ))}
        </div>

        {/* Col 2: Main + Joker */}
        <div className="mb-6 md:mb-0">
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
                loggedWeight={loggedSets[globalIdx]?.weight}
                amrapTargets={s.isAmrap ? amrapTargets : undefined}
                onLog={(reps, weight) => handleLog(globalIdx, reps, weight)}
                onEdit={(reps, weight) => handleEdit(globalIdx, reps, weight)}
                onWeightChange={s.isAmrap ? handleAmrapWeightChange : undefined}
                onDelete={globalIdx === currentSetIndex - 1 ? handleDeleteSet : undefined}
              />
            )
          })}
          {jokerSetsRendered.length > 0 && (
            <div className="mt-4">
              <div className="text-muted uppercase text-xs tracking-widest mb-2">JOKER SETS</div>
              {jokerSetsRendered.map((s, i) => {
                const globalIdx = warmupCount + mainCount + i
                return (
                  <SetRow
                    key={i}
                    set={s}
                    isActive={currentSetIndex === globalIdx}
                    isCompleted={globalIdx < currentSetIndex}
                    loggedReps={loggedSets[globalIdx]?.reps}
                    loggedWeight={loggedSets[globalIdx]?.weight}
                    onLog={(reps, weight) => handleLog(globalIdx, reps, weight)}
                    onEdit={(reps, weight) => handleEdit(globalIdx, reps, weight)}
                    onDelete={globalIdx === currentSetIndex - 1 ? handleDeleteSet : undefined}
                  />
                )
              })}
            </div>
          )}
          {showJokerButton && (
            <button
              onClick={handleAddJoker}
              className="w-full border border-warn text-warn py-3 font-mono text-xs tracking-widest hover:bg-warn/10 mt-4"
            >
              + JOKER SET  {nextJokerWeight}lb
            </button>
          )}
        </div>

        {/* Col 3: FSL */}
        <div className="mb-6 md:mb-0">
          <div className="text-muted uppercase text-xs tracking-widest mb-2">FSL  5 x 10</div>
          {fslSets.map((s, i) => {
            const globalIdx = warmupCount + mainCount + jokerCount + i
            return (
              <SetRow
                key={i}
                set={{ ...s, isAmrap: false }}
                isActive={currentSetIndex === globalIdx}
                isCompleted={globalIdx < currentSetIndex}
                loggedReps={loggedSets[globalIdx]?.reps}
                loggedWeight={loggedSets[globalIdx]?.weight}
                onLog={(reps, weight) => handleLog(globalIdx, reps, weight)}
                onEdit={(reps, weight) => handleEdit(globalIdx, reps, weight)}
                onDelete={globalIdx === currentSetIndex - 1 ? handleDeleteSet : undefined}
              />
            )
          })}
        </div>

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

      {showPicker && lift && (
        <AccessoryPicker liftId={lift.id!} onClose={() => { setShowPicker(false); loadData() }} />
      )}

      {cycleCompleteData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-accent p-6 font-mono max-w-sm w-full">
            <div className="text-accent uppercase tracking-widest text-sm mb-1">CYCLE COMPLETE</div>
            <div className="text-muted text-xs mb-4">New training maxes:</div>
            <div className="mb-6 space-y-2">
              {cycleCompleteData.map(({ liftName, weight }) => (
                <div key={liftName} className="flex justify-between text-sm">
                  <span className="text-text uppercase tracking-widest">{liftName}</span>
                  <span className="text-accent">{weight} lbs</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleCycleCompleteDismiss}
              className="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono"
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}

      <RestTimer />
    </div>
  )
}

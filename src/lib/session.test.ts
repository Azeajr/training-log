// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { TrainingDB, type Lift } from '../db/db'
import { getNextSession, advanceCycleIfComplete, applyTmProgression, applyAccessoryTmProgression, getAmrapTargets, deloadTms } from './session'

let db: TrainingDB

beforeEach(() => {
  db = new TrainingDB()
})

afterEach(async () => {
  await db.delete()
})

const LIFT_DEFS = [
  { name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

async function seedLifts(): Promise<Lift[]> {
  await db.lifts.bulkAdd(LIFT_DEFS)
  return (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
}

async function seedTms(lifts: Lift[], weight = 200) {
  for (const lift of lifts) {
    await db.trainingMaxes.add({ liftId: lift.id!, weight, setAt: new Date('2026-01-01') })
  }
}

async function addSessions(cycleId: number, week: 1 | 2 | 3 | 4, lifts: Lift[], status: 'completed' | 'skipped' = 'completed') {
  for (const lift of lifts) {
    await db.sessions.add({ cycleId, liftId: lift.id!, week, date: new Date(), notes: null, status })
  }
}

describe('getNextSession', () => {
  it('creates cycle 1 and returns first lift at week 1 when no data exists', async () => {
    const lifts = await seedLifts()

    const result = await getNextSession(db)

    expect(result.week).toBe(1)
    expect(result.liftId).toBe(lifts[0].id)
    const cycles = await db.cycles.toArray()
    expect(cycles).toHaveLength(1)
    expect(cycles[0].number).toBe(1)
  })

  it('returns the next incomplete lift within the current week', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: lifts[0].id!, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: lifts[1].id!, week: 1, date: new Date(), notes: null, status: 'completed' })

    const result = await getNextSession(db)

    expect(result.week).toBe(1)
    expect(result.liftId).toBe(lifts[2].id) // Bench is next
  })

  it('advances to week 2 once all 4 lifts complete week 1', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)

    const result = await getNextSession(db)

    expect(result.week).toBe(2)
    expect(result.liftId).toBe(lifts[0].id)
  })

  it('counts skipped sessions toward week completion', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts, 'skipped')

    const result = await getNextSession(db)

    expect(result.week).toBe(2)
  })

  it('does not count pending sessions toward week progress (line 57 false branch)', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts.slice(0, 3)) // 3 completed
    await db.sessions.add({ cycleId, liftId: lifts[3].id!, week: 1, date: new Date(), notes: null, status: 'pending' })

    const result = await getNextSession(db)

    expect(result.week).toBe(1) // still week 1 — pending didn't count
    expect(result.liftId).toBe(lifts[3].id) // next = the lift with the pending session
  })

  it('falls back to first lift when all lifts done but fewer than 4 lifts exist (line 73 ?? fallback)', async () => {
    const lift1Id = await db.lifts.add({ name: 'OHP'   as const, order: 1, progressionIncrement: 5,  baseWeight: 95, liftType: 'upper' as const })
    const lift2Id = await db.lifts.add({ name: 'Bench' as const, order: 2, progressionIncrement: 5,  baseWeight: 95, liftType: 'upper' as const })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: lift1Id, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: lift2Id, week: 1, date: new Date(), notes: null, status: 'completed' })

    const result = await getNextSession(db)

    // weekCounts[1]=2 < 4 → still week 1; all 2 lifts in completedLiftIds → nextLift=undefined → fallback lifts[0]
    expect(result.week).toBe(1)
    expect(result.liftId).toBe(lift1Id)
  })

  it('stays at week 4 when not all 4 week-4 lifts are done', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    // Only 2 of 4 week-4 sessions done
    await db.sessions.add({ cycleId, liftId: lifts[0].id!, week: 4, date: new Date(), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: lifts[1].id!, week: 4, date: new Date(), notes: null, status: 'completed' })

    const result = await getNextSession(db)

    expect(result.week).toBe(4)
    expect(result.cycleId).toBe(cycleId)
    expect(await db.cycles.count()).toBe(1)
  })
})

describe('advanceCycleIfComplete', () => {
  it('returns advanced: false when no cycle exists', async () => {
    const result = await advanceCycleIfComplete(db)

    expect(result.advanced).toBe(false)
    expect(result.newTms).toHaveLength(0)
  })

  it('returns advanced: false when week 4 is not yet fully complete', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    // Only 3 of 4 week-4 sessions done
    for (const lift of lifts.slice(0, 3)) {
      await db.sessions.add({ cycleId, liftId: lift.id!, week: 4, date: new Date(), notes: null, status: 'completed' })
    }

    const result = await advanceCycleIfComplete(db)

    expect(result.advanced).toBe(false)
    expect(result.newTms).toHaveLength(0)
  })

  it('creates cycle N+1 when all 4 week-4 sessions are done', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)

    await advanceCycleIfComplete(db)

    const cycles = (await db.cycles.toArray()).sort((a, b) => a.number - b.number)
    expect(cycles).toHaveLength(2)
    expect(cycles[1].number).toBe(2)
  })

  it('increments TMs by each lift\'s progressionIncrement', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)

    const { advanced, newTms } = await advanceCycleIfComplete(db)

    expect(advanced).toBe(true)
    expect(newTms).toHaveLength(4)
    const byName = Object.fromEntries(newTms.map(t => [t.liftName, t.weight]))
    expect(byName['OHP']).toBe(205)      // 200 + 5
    expect(byName['Bench']).toBe(205)    // 200 + 5
    expect(byName['Deadlift']).toBe(210) // 200 + 10
    expect(byName['Squat']).toBe(210)    // 200 + 10
  })

  it('is idempotent — calling twice does not double-increment', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)

    await advanceCycleIfComplete(db)
    const second = await advanceCycleIfComplete(db)

    expect(second.advanced).toBe(false)
    const ohp = lifts.find(l => l.name === 'OHP')!
    const tms = await db.trainingMaxes.where('liftId').equals(ohp.id!).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(205)
  })

  it('does not advance when week 4 has pending sessions mixed in (line 89 false branch)', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 3; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)
    await addSessions(cycleId, 4, lifts.slice(0, 3)) // 3 completed
    await db.sessions.add({ cycleId, liftId: lifts[3].id!, week: 4, date: new Date(), notes: null, status: 'pending' })

    const result = await advanceCycleIfComplete(db)

    expect(result.advanced).toBe(false) // weekCounts[4]=3, pending not counted
  })

  it('excludes lifts with no TM from newTms list (line 107 false branch)', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts.slice(0, 3)) // only 3 of 4 have TMs; lifts[3] (Squat) has none
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)

    const { advanced, newTms } = await advanceCycleIfComplete(db)

    expect(advanced).toBe(true)
    expect(newTms).toHaveLength(3) // Squat has no TM → if(latest) false → excluded
  })

  it('counts skipped week-4 sessions toward cycle completion', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    await addSessions(cycleId, 4, lifts, 'skipped')

    const { advanced } = await advanceCycleIfComplete(db)

    expect(advanced).toBe(true)
  })
})

// V(G)=3 (loop over lifts × has-TM branch); independent paths P1..P3
describe('applyTmProgression', () => {
  it('P1: increments each lift TM by its progressionIncrement', async () => { // happy path
    const lifts = await seedLifts()
    await seedTms(lifts, 200)

    await applyTmProgression(db)

    const byName = Object.fromEntries(
      await Promise.all(lifts.map(async l => {
        const tms = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
        return [l.name, tms[tms.length - 1].weight] as [string, number]
      }))
    )
    expect(byName['OHP']).toBe(205)      // BVA: upper +5
    expect(byName['Deadlift']).toBe(210) // BVA: lower +10
    expect(byName['Bench']).toBe(205)    // BVA: upper +5
    expect(byName['Squat']).toBe(210)    // BVA: lower +10
  })

  it('P2: does not add TM when no prior TM exists for lift', async () => { // branch: no currentTm
    await seedLifts()
    // no TMs seeded

    await applyTmProgression(db)

    expect(await db.trainingMaxes.count()).toBe(0)
  })

  it('P3: creates a new TM row and preserves the original', async () => { // invariant: add not update
    const lifts = await seedLifts()
    await seedTms(lifts, 100)

    await applyTmProgression(db)

    const ohpTms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(ohpTms).toHaveLength(2)
    expect(ohpTms[0].weight).toBe(100) // original preserved
    expect(ohpTms[1].weight).toBe(105) // new row added
  })
})

// V(G)=4 (outer loop over exercises × has-TM branch + inner anyOf); paths P1..P4
describe('applyAccessoryTmProgression', () => {
  async function seedAccessoryData() {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId: lifts[0].id!, week: 1, date: new Date(), notes: null, status: 'completed',
    })
    const ex1 = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const ex2 = await db.exercises.add({ name: 'Dip', type: 'reps' })
    return { cycleId, sessionId, ex1, ex2 }
  }

  it('P1: increments accessory TM by incrementLb for exercise used in cycle', async () => { // happy path
    const { cycleId, sessionId, ex1 } = await seedAccessoryData()
    await db.accessorySets.add({ sessionId, exerciseId: ex1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await db.accessoryTrainingMaxes.add({ exerciseId: ex1, weight: 50, incrementLb: 5, setAt: new Date('2026-01-01') })

    await applyAccessoryTmProgression(db, cycleId)

    const tms = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex1).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(55)
  })

  it('P2: increments each used exercise independently — BVA: max iterations (2 exercises)', async () => {
    const { cycleId, sessionId, ex1, ex2 } = await seedAccessoryData()
    await db.accessorySets.bulkAdd([
      { sessionId, exerciseId: ex1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
      { sessionId, exerciseId: ex2, setNumber: 1, weight: 100, reps: 5, duration: null, distance: null },
    ])
    await db.accessoryTrainingMaxes.bulkAdd([
      { exerciseId: ex1, weight: 50, incrementLb: 5,  setAt: new Date('2026-01-01') },
      { exerciseId: ex2, weight: 100, incrementLb: 10, setAt: new Date('2026-01-01') },
    ])

    await applyAccessoryTmProgression(db, cycleId)

    const tms1 = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex1).sortBy('setAt')
    const tms2 = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex2).sortBy('setAt')
    expect(tms1[tms1.length - 1].weight).toBe(55)
    expect(tms2[tms2.length - 1].weight).toBe(110)
  })

  it('P3: does not increment TM for exercise not used in cycle — BVA: 0 iterations', async () => { // FF branch
    const { cycleId, ex1 } = await seedAccessoryData()
    // ex1 has a TM but no accessory sets in this cycle
    await db.accessoryTrainingMaxes.add({ exerciseId: ex1, weight: 50, incrementLb: 5, setAt: new Date('2026-01-01') })

    await applyAccessoryTmProgression(db, cycleId)

    const tms = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex1).sortBy('setAt')
    expect(tms).toHaveLength(1) // no new row added
  })

  it('P4: does not crash when exercise used in cycle has no prior TM', async () => { // edge: no currentTm
    const { cycleId, sessionId, ex1 } = await seedAccessoryData()
    await db.accessorySets.add({ sessionId, exerciseId: ex1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    // no accessoryTrainingMaxes for ex1

    await applyAccessoryTmProgression(db, cycleId)

    expect(await db.accessoryTrainingMaxes.count()).toBe(0)
  })
})

// V(G)=6 (filter completed+week≠4, find lastSession, find prevCycle, two amrap set lookups); paths P1..P7
describe('getAmrapTargets', () => {
  async function seedAmrapSession(
    opts: { cycleId: number; liftId: number; week: 1|2|3|4; status?: 'completed'|'pending'|'skipped'; amrapWeight?: number; amrapReps?: number; date?: Date }
  ) {
    const sessionId = await db.sessions.add({
      cycleId: opts.cycleId,
      liftId: opts.liftId,
      week: opts.week,
      date: opts.date ?? new Date(),
      notes: null,
      status: opts.status ?? 'completed',
    })
    if (opts.amrapWeight !== undefined) {
      await db.sets.add({
        sessionId, type: 'main', setNumber: 3,
        weight: opts.amrapWeight, reps: opts.amrapReps ?? 8, isAmrap: true,
      })
    }
    return sessionId
  }

  it('P1: returns [] when no prior completed sessions exist', async () => { // base case — BVA: 0-iter
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })

    const result = await getAmrapTargets(lifts[0].id!, 1, cycleId, db)

    expect(result).toEqual([])
  })

  it('P2: returns Last session target from most recent completed session', async () => { // happy path
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    // week 2 session — will be lastSession but NOT a prevCycleSession for week 1
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 2, amrapWeight: 205, amrapReps: 9 })
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date('2026-02-01'), endDate: null })

    const result = await getAmrapTargets(lifts[0].id!, 1, cycle2, db)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ weight: 205, reps: 9, label: 'Last session' })
  })

  it('P3: returns both Last session and Last cycle when both exist — TT condition', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 200, amrapReps: 7 })
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date('2026-02-01'), endDate: null })
    // more recent session in same cycle (different week so it becomes lastSession, not lastCycle)
    await seedAmrapSession({ cycleId: cycle2, liftId: lifts[0].id!, week: 2, amrapWeight: 205, amrapReps: 9, date: new Date('2026-02-15') })

    const result = await getAmrapTargets(lifts[0].id!, 1, cycle2, db)

    const labels = result.map(r => r.label)
    expect(labels).toContain('Last session')
    expect(labels).toContain('Last cycle')
  })

  it('P4: ignores pending sessions — TF condition (status=pending)', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedAmrapSession({ cycleId, liftId: lifts[0].id!, week: 1, status: 'pending', amrapWeight: 205, amrapReps: 8 })
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date(), endDate: null })

    const result = await getAmrapTargets(lifts[0].id!, 1, cycle2, db)

    expect(result).toEqual([])
  })

  it('P5: ignores week-4 sessions — FT condition (week=4 filtered)', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 4, amrapWeight: 205, amrapReps: 8 })
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date(), endDate: null })

    const result = await getAmrapTargets(lifts[0].id!, 4, cycle2, db)

    expect(result).toEqual([])
  })

  it('P6: returns no entry when completed session has no AMRAP set — FF condition', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1 }) // no amrapWeight
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date(), endDate: null })

    const result = await getAmrapTargets(lifts[0].id!, 1, cycle2, db)

    expect(result).toEqual([])
  })

  it('P7: returns most recent session as Last session when multiple prior sessions exist — sort correctness', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 195, amrapReps: 6, date: new Date('2026-01-10') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 2, amrapWeight: 210, amrapReps: 10, date: new Date('2026-01-20') })
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date('2026-02-01'), endDate: null })

    const result = await getAmrapTargets(lifts[0].id!, 1, cycle2, db)

    // Most recent is week-2 session (Jan 20) → Last session
    expect(result[0]).toMatchObject({ weight: 210, reps: 10, label: 'Last session' })
  })
})

describe('deloadTms', () => {
  it('reduces each lift TM by 10% rounded to nearest 5', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await deloadTms()
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(180) // 200 * 0.9 = 180, rounded to 5
  })

  it('uses custom pct parameter', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await deloadTms(undefined, 0.05)
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(190) // 200 * 0.95 = 190
  })

  it('does nothing when no TMs exist', async () => {
    await seedLifts()
    await deloadTms()
    expect(await db.trainingMaxes.count()).toBe(0)
  })

  it('preserves original TM and adds new deloaded row', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await deloadTms()
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms).toHaveLength(2)
    expect(tms[0].weight).toBe(200)
    expect(tms[1].weight).toBe(180)
  })
})

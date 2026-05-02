// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { TrainingDB, type Lift } from '../db/db'
import { getNextSession, advanceCycleIfComplete } from './session'

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

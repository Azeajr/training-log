// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import type { Lift, Cycle } from '../types/domain'
import {
  advanceCycleIfComplete,
  applyTmProgression,
  applyAccessoryTmProgression,
  computeClosedThroughWeek,
  deloadTms,
  getNextSessionAdvancingIfDone,
  getRecentAmraps,
} from './cycle'
import { archiveLift } from './lift'

const mkLift = (name: string, order: number) =>
  db.lifts.add({ name, order, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' as const })
const complete = (cycleId: number, liftId: number, week: 1 | 2 | 3 | 4) =>
  db.sessions.add({ cycleId, liftId, week, date: new Date(), notes: null, status: 'completed' as const })

beforeEach(async () => { await __resetForTest() })

const LIFT_DEFS = [
  { name: 'OHP' as const,      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { name: 'Bench' as const,    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Squat' as const,    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

async function seedLifts(): Promise<Lift[]> {
  await db.lifts.bulkAdd(LIFT_DEFS)
  return (await db.lifts.toArray() as Lift[]).sort((a: Lift, b: Lift) => a.order - b.order)
}

async function seedTms(lifts: Lift[], weight = 200) {
  for (const lift of lifts) {
    await db.trainingMaxes.add({ liftId: lift.id!, weight, setAt: new Date('2026-01-01') })
  }
}

async function addSessions(
  cycleId: number, week: 1 | 2 | 3 | 4, lifts: Lift[],
  status: 'completed' | 'skipped' = 'completed',
) {
  for (const lift of lifts) {
    await db.sessions.add({ cycleId, liftId: lift.id!, week, date: new Date(), notes: null, status })
  }
}

// ─── computeClosedThroughWeek ───────────────────────────────────────────────────

describe('computeClosedThroughWeek', () => {
  const done = (week: number, ...liftIds: number[]) =>
    liftIds.map(liftId => ({ week, liftId, status: 'completed' }))

  it('never drops below the stored high-water mark', () => {
    expect(computeClosedThroughWeek([], [1, 2], 2)).toBe(2)
  })

  it('advances over contiguous fully-completed weeks', () => {
    expect(computeClosedThroughWeek([...done(1, 1, 2), ...done(2, 1, 2)], [1, 2], 0)).toBe(2)
  })

  it('stops at the first incomplete week', () => {
    // lift 2 has no week-2 session
    expect(computeClosedThroughWeek([...done(1, 1, 2), ...done(2, 1)], [1, 2], 0)).toBe(1)
  })

  it('counts skipped sessions as closing a week', () => {
    const sessions = [
      { week: 1, liftId: 1, status: 'skipped' },
      { week: 1, liftId: 2, status: 'skipped' },
    ]
    expect(computeClosedThroughWeek(sessions, [1, 2], 0)).toBe(1)
  })

  it('does not reopen a closed week when a new lift joins owing only later weeks (issue #52)', () => {
    // Week 1 closed for {1,2}; lift 3 added mid-cycle. The mark holds at 1.
    expect(computeClosedThroughWeek([...done(1, 1, 2)], [1, 2, 3], 1)).toBe(1)
  })

  it('closes no week when the active roster is empty (kills L24 length-guard mutant)', () => {
    // every() over an empty activeLiftIds is vacuously true. Without the
    // `length > 0` guard, an empty roster would "complete" every week and the
    // mark would jump to 4 — the guard must keep it at the prior high-water mark.
    expect(computeClosedThroughWeek([], [], 0)).toBe(0)
    expect(computeClosedThroughWeek([...done(1)], [], 2)).toBe(2)
  })
})

// ─── getNextSession ───────────────────────────────────────────────────────────

describe('getNextSession', () => {
  it('creates cycle 1 and returns first lift at week 1 when empty', async () => {
    const lifts = await seedLifts()
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(1)
    expect(result.liftId).toBe(lifts[0].id)
    const cycles = await db.cycles.toArray()
    expect(cycles).toHaveLength(1)
    expect(cycles[0].number).toBe(1)
  })

  it('returns next incomplete lift within current week', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: lifts[0].id!, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: lifts[1].id!, week: 1, date: new Date(), notes: null, status: 'completed' })
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(1)
    expect(result.liftId).toBe(lifts[2].id)
  })

  it('advances to week 2 after all 4 week-1 lifts complete', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(2)
    expect(result.liftId).toBe(lifts[0].id)
  })

  it('counts skipped sessions toward week completion', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts, 'skipped')
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(2)
  })

  it('stays at week 4 when not all week-4 lifts done', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    await db.sessions.add({ cycleId, liftId: lifts[0].id!, week: 4, date: new Date(), notes: null, status: 'completed' })
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(4)
    expect(result.cycleId).toBe(cycleId)
    expect(await db.cycles.count()).toBe(1)
  })

  it('auto-advances to new cycle and returns week 1 first lift when all 4 weeks complete', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    await addSessions(cycleId, 4, lifts)
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.liftId).toBe(lifts[0].id)
    expect(result.week).toBe(1)
    expect(result.cycleId).not.toBe(cycleId)
    expect(await db.cycles.count()).toBe(2)
  })

  it('does not count pending sessions toward week progress', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts.slice(0, 3))
    await db.sessions.add({ cycleId, liftId: lifts[3].id!, week: 1, date: new Date(), notes: null, status: 'pending' })
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(1)
    expect(result.liftId).toBe(lifts[3].id)
  })

  it('reopened week highlights the first lift by order, not a new mid-cycle lift', async () => {
    // Repro of the on-device glitch: week 1 done for the original lifts, then a
    // new lift is added *mid-order* (Hip Thrust between OHP and Bench) which owes
    // no old week-1 row. Reopening week 1 adds a fresh pending row per lift. The
    // old selection picked the lift without a completed row (the new one); it
    // must instead follow lift order and land on the first lift (OHP).
    const ohp   = await db.lifts.add({ name: 'OHP' as const,   order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const })
    const bench = await db.lifts.add({ name: 'Bench' as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const })
    const squat = await db.lifts.add({ name: 'Squat' as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null, closedThroughWeek: 0 })
    // Old completed history for the original three lifts only.
    for (const liftId of [ohp, bench, squat]) {
      await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed' })
    }
    // New lift inserted mid-order, owing no old week-1 row.
    const hipThrust = await db.lifts.add({ name: 'Hip Thrust' as const, order: 2, progressionIncrement: 5, baseWeight: 95, liftType: 'lower' as const })
    // Reopen: a fresh pending row per active lift.
    for (const liftId of [ohp, hipThrust, bench, squat]) {
      await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'pending' })
    }
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(1)
    expect(result.liftId).toBe(ohp)
  })

  it('ignores other-week completions when picking the next lift mid-week (kills L137 week-conjunct mutant)', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await db.sessions.add({ cycleId, liftId: lifts[0].id!, week: 2, date: new Date(), notes: null, status: 'completed' })
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(2)
    // Week-1 completions must not mark lifts done for week 2: with the week
    // filter dropped, all four lifts look complete and the fallback wrongly
    // re-suggests lifts[0] — the one week-2 lift already done.
    expect(result.liftId).toBe(lifts[1].id)
  })

  it('advances week with a 2-lift roster once both week lifts are done (completion = active lift count)', async () => {
    const lift1Id = await db.lifts.add({ name: 'OHP' as const,   order: 1, progressionIncrement: 5, baseWeight: 95,  liftType: 'upper' as const })
    const lift2Id = await db.lifts.add({ name: 'Bench' as const, order: 2, progressionIncrement: 5, baseWeight: 95,  liftType: 'upper' as const })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: lift1Id, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: lift2Id, week: 1, date: new Date(), notes: null, status: 'completed' })
    const result = await getNextSessionAdvancingIfDone(db)
    expect(result.week).toBe(2)
    expect(result.liftId).toBe(lift1Id)
  })
})

// ─── getNextSession defensive guards ──────────────────────────────────────────

describe('getNextSessionAdvancingIfDone — empty roster + persistence', () => {
  it('throws when a fresh DB has no active lifts (covers the no-coverage throw on the create path)', async () => {
    // No cycle, no lifts: it creates cycle 1, then has nothing to schedule.
    await expect(getNextSessionAdvancingIfDone(db)).rejects.toThrow('No active lifts')
  })

  it('throws when a cycle exists but the active roster is empty (covers the no-coverage mid-function throw)', async () => {
    // Cycle present, zero lifts → guard fires before the closed/advance block.
    await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await expect(getNextSessionAdvancingIfDone(db)).rejects.toThrow('No active lifts')
  })

  it('persists the recomputed closedThroughWeek high-water mark to the cycle row (kills the diff-guard)', async () => {
    // A `closed !== stored → false` mutant would skip the write; result.week alone
    // can't catch it because week is computed from the local var, not the row.
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null, closedThroughWeek: 0 })
    await addSessions(cycleId, 1, lifts)
    await getNextSessionAdvancingIfDone(db)
    const [cycle] = await db.cycles.toArray()
    expect(cycle.id).toBe(cycleId)
    expect(cycle.closedThroughWeek).toBe(1)
  })
})

// ─── advanceCycleIfComplete ───────────────────────────────────────────────────

describe('advanceCycleIfComplete', () => {
  it('returns advanced: false when no cycle exists', async () => {
    const result = await advanceCycleIfComplete(db)
    expect(result.advanced).toBe(false)
    expect(result.newTms).toHaveLength(0)
  })

  it('persists closedThroughWeek without advancing when only weeks 1–2 are complete (kills the diff-guard)', async () => {
    // Runs the high-water update (line ~76) but returns before the week-4 advance.
    // A `closed !== stored → false` mutant leaves closedThroughWeek at 0.
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    const result = await advanceCycleIfComplete(db)
    expect(result.advanced).toBe(false)
    const [cycle] = await db.cycles.toArray()
    expect(cycle.closedThroughWeek).toBe(2)
  })

  it('returns advanced: false when week 4 incomplete', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    for (const lift of lifts.slice(0, 3)) {
      await db.sessions.add({ cycleId, liftId: lift.id!, week: 4, date: new Date(), notes: null, status: 'completed' })
    }
    const result = await advanceCycleIfComplete(db)
    expect(result.advanced).toBe(false)
    // Pin the empty arrays on the not-complete return (kills L51 ArrayDeclaration mutants)
    expect(result.doublingCandidates).toEqual([])
    expect(result.newTms).toEqual([])
  })

  it('creates cycle N+1 when all 4 week-4 sessions done', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)
    await advanceCycleIfComplete(db)
    const cycles = (await db.cycles.toArray() as Cycle[]).sort((a: Cycle, b: Cycle) => a.number - b.number)
    expect(cycles).toHaveLength(2)
    expect(cycles[1].number).toBe(2)
  })

  it('closes the completed cycle with an endDate and leaves the new cycle open', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)
    await advanceCycleIfComplete(db)
    const cycles = (await db.cycles.toArray() as Cycle[]).sort((a: Cycle, b: Cycle) => a.number - b.number)
    expect(cycles[0].endDate).toBeInstanceOf(Date)
    expect(cycles[1].endDate).toBeNull()
  })

  it('increments TMs by each lift progressionIncrement', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)
    const { advanced, newTms } = await advanceCycleIfComplete(db)
    expect(advanced).toBe(true)
    expect(newTms).toHaveLength(4)
    const byName = Object.fromEntries(newTms.map(t => [t.liftName, t.weight]))
    expect(byName['OHP']).toBe(205)
    expect(byName['Deadlift']).toBe(210)
    expect(byName['Bench']).toBe(205)
    expect(byName['Squat']).toBe(210)
    const byOld = Object.fromEntries(newTms.map(t => [t.liftName, t.oldWeight]))
    expect(byOld['OHP']).toBe(200)
    expect(byOld['Deadlift']).toBe(200)
  })

  it('is idempotent — second call does not advance again', async () => {
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

  it('does not advance when week 4 has pending sessions mixed in', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 3; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)
    await addSessions(cycleId, 4, lifts.slice(0, 3))
    await db.sessions.add({ cycleId, liftId: lifts[3].id!, week: 4, date: new Date(), notes: null, status: 'pending' })
    const result = await advanceCycleIfComplete(db)
    expect(result.advanced).toBe(false)
  })

  it('omits lifts with no training max from newTms', async () => {
    const lifts = await seedLifts()
    // Only first lift has a TM; others have none
    await db.trainingMaxes.add({ liftId: lifts[0].id!, weight: 200, setAt: new Date('2026-01-01') })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    await addSessions(cycleId, 3, lifts)
    await addSessions(cycleId, 4, lifts)
    const result = await advanceCycleIfComplete(db)
    expect(result.advanced).toBe(true)
    // applyTmProgression only adds TM for lifts that already have one
    // so only lifts[0] appears in newTms
    expect(result.newTms).toHaveLength(1)
    expect(result.newTms[0].liftName).toBe(lifts[0].name)
  })
})

// ─── applyTmProgression ───────────────────────────────────────────────────────

describe('applyTmProgression', () => {
  it('increments each lift TM by progressionIncrement', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await applyTmProgression(db)
    const byName = Object.fromEntries(
      await Promise.all(lifts.map(async l => {
        const tms = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
        return [l.name, tms[tms.length - 1].weight] as [string, number]
      }))
    )
    expect(byName['OHP']).toBe(205)
    expect(byName['Deadlift']).toBe(210)
    expect(byName['Bench']).toBe(205)
    expect(byName['Squat']).toBe(210)
  })

  it('does nothing when no prior TM exists for any lift', async () => {
    await seedLifts()
    await applyTmProgression(db)
    expect(await db.trainingMaxes.count()).toBe(0)
  })

  it('preserves original TM row and adds new one', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 100)
    await applyTmProgression(db)
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms).toHaveLength(2)
    expect(tms[0].weight).toBe(100)
    expect(tms[1].weight).toBe(105)
  })
})

// ─── applyAccessoryTmProgression ─────────────────────────────────────────────

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

  it('increments TM for exercise used in cycle', async () => {
    const { cycleId, sessionId, ex1 } = await seedAccessoryData()
    await db.accessorySets.add({ sessionId, exerciseId: ex1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await db.accessoryTrainingMaxes.add({ exerciseId: ex1, weight: 50, incrementLb: 5, setAt: new Date('2026-01-01') })
    await applyAccessoryTmProgression(db, cycleId)
    const tms = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex1).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(55)
  })

  it('increments each used exercise independently', async () => {
    const { cycleId, sessionId, ex1, ex2 } = await seedAccessoryData()
    await db.accessorySets.bulkAdd([
      { sessionId, exerciseId: ex1, setNumber: 1, weight: 50,  reps: 8, duration: null, distance: null },
      { sessionId, exerciseId: ex2, setNumber: 1, weight: 100, reps: 5, duration: null, distance: null },
    ])
    await db.accessoryTrainingMaxes.bulkAdd([
      { exerciseId: ex1, weight: 50,  incrementLb: 5,  setAt: new Date('2026-01-01') },
      { exerciseId: ex2, weight: 100, incrementLb: 10, setAt: new Date('2026-01-01') },
    ])
    await applyAccessoryTmProgression(db, cycleId)
    const tms1 = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex1).sortBy('setAt')
    const tms2 = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex2).sortBy('setAt')
    expect(tms1[tms1.length - 1].weight).toBe(55)
    expect(tms2[tms2.length - 1].weight).toBe(110)
  })

  it('does not increment TM for exercise not used in cycle', async () => {
    const { cycleId, ex1 } = await seedAccessoryData()
    await db.accessoryTrainingMaxes.add({ exerciseId: ex1, weight: 50, incrementLb: 5, setAt: new Date('2026-01-01') })
    await applyAccessoryTmProgression(db, cycleId)
    const tms = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex1).sortBy('setAt')
    expect(tms).toHaveLength(1)
  })

  it('does not crash when used exercise has no prior TM', async () => {
    const { cycleId, sessionId, ex1 } = await seedAccessoryData()
    await db.accessorySets.add({ sessionId, exerciseId: ex1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await applyAccessoryTmProgression(db, cycleId)
    expect(await db.accessoryTrainingMaxes.count()).toBe(0)
  })
})

// ─── deloadTms ────────────────────────────────────────────────────────────────

describe('deloadTms', () => {
  it('reduces each lift TM by 10% rounded to nearest 5', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await deloadTms(db)
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(180) // 200 * 0.9 = 180
  })

  it('uses custom pct parameter', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await deloadTms(db, 0.05)
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(190) // 200 * 0.95 = 190
  })

  it('does nothing when no TMs exist', async () => {
    await seedLifts()
    await deloadTms(db)
    expect(await db.trainingMaxes.count()).toBe(0)
  })

  it('preserves original TM row', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    await deloadTms(db)
    const tms = await db.trainingMaxes.where('liftId').equals(lifts[0].id!).sortBy('setAt')
    expect(tms).toHaveLength(2)
    expect(tms[0].weight).toBe(200)
  })
})

// ─── flexible roster: completion = active lift count, with mid-cycle guards ────

describe('flexible roster completion', () => {
  it('requires every active lift before advancing the week (3-lift roster)', async () => {
    const a = await mkLift('A', 1)
    const b = await mkLift('B', 2)
    const c = await mkLift('C', 3)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await complete(cycleId, a, 1)
    await complete(cycleId, b, 1)

    let r = await getNextSessionAdvancingIfDone(db)
    expect(r.week).toBe(1)
    expect(r.liftId).toBe(c) // C still owes week 1

    await complete(cycleId, c, 1)
    r = await getNextSessionAdvancingIfDone(db)
    expect(r.week).toBe(2)
  })

  it('adding a lift mid-cycle does not reopen already-closed weeks', async () => {
    const a = await mkLift('A', 1)
    const b = await mkLift('B', 2)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null, closedThroughWeek: 0 })
    await complete(cycleId, a, 1)
    await complete(cycleId, b, 1)
    // Close week 1 (persists the high-water mark)
    let r = await getNextSessionAdvancingIfDone(db)
    expect(r.week).toBe(2)
    expect((await db.cycles.get(cycleId))?.closedThroughWeek).toBe(1)

    // New lift added after week 1 closed — week 1 stays done, C only owes week 2+
    await mkLift('C', 3)
    r = await getNextSessionAdvancingIfDone(db)
    expect(r.week).toBe(2)
    expect((await db.cycles.get(cycleId))?.closedThroughWeek).toBe(1)
  })

  it('archiving a lift mid-week lets the remaining lifts complete the week', async () => {
    const a = await mkLift('A', 1)
    const b = await mkLift('B', 2)
    const c = await mkLift('C', 3)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await complete(cycleId, a, 1)
    await complete(cycleId, b, 1)
    // C not done — week 1 incomplete with 3 lifts
    let r = await getNextSessionAdvancingIfDone(db)
    expect(r.week).toBe(1)
    expect(r.liftId).toBe(c)

    await archiveLift(db, c)
    r = await getNextSessionAdvancingIfDone(db)
    expect(r.week).toBe(2) // only A and B required now; week 1 is complete
  })

  it('archived lift completed history still counts; advance ignores it', async () => {
    const a = await mkLift('A', 1)
    const b = await mkLift('B', 2)
    await db.trainingMaxes.add({ liftId: a, weight: 200, setAt: new Date() })
    await db.trainingMaxes.add({ liftId: b, weight: 200, setAt: new Date() })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (const w of [1, 2, 3, 4] as const) { await complete(cycleId, a, w); await complete(cycleId, b, w) }
    const extra = await mkLift('C', 3)
    await archiveLift(db, extra) // archived → not required for week 4
    const { advanced } = await advanceCycleIfComplete(db)
    expect(advanced).toBe(true)
  })
})

// ─── getRecentAmraps ─────────────────────────────────────────────────────────

describe('getRecentAmraps', () => {
  async function seedAmrapSession(opts: {
    cycleId: number; liftId: number; week: 1 | 2 | 3 | 4
    status?: 'completed' | 'pending' | 'skipped'
    amrapWeight?: number; amrapReps?: number; date?: Date
  }) {
    const sessionId = await db.sessions.add({
      cycleId: opts.cycleId, liftId: opts.liftId, week: opts.week,
      date: opts.date ?? new Date(), notes: null, status: opts.status ?? 'completed',
    })
    if (opts.amrapWeight !== undefined) {
      await db.sets.add({
        sessionId, type: 'main', setNumber: 3,
        weight: opts.amrapWeight, reps: opts.amrapReps ?? 8, isAmrap: true,
      })
    }
    return sessionId
  }

  it('returns [] when no prior completed sessions', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedAmrapSession({ cycleId, liftId: lifts[0].id!, week: 1, status: 'pending', amrapWeight: 205 })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([])
  })

  it('returns recent AMRAPs most-recent-first', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 195, amrapReps: 6, date: new Date('2026-01-10') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 2, amrapWeight: 210, amrapReps: 10, date: new Date('2026-01-20') })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([
      { weight: 210, reps: 10 },
      { weight: 195, reps: 6 },
    ])
  })

  it('caps at the window (default 3), dropping the oldest', async () => {
    const lifts = await seedLifts()
    // Five distinct (cycle, week) sessions across two cycles — the window caps
    // to the 3 newest by date. Kept distinct so the recency cap, not the
    // redo-dedup, is what's under test here.
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    const cycle2 = await db.cycles.add({ number: 2, startDate: new Date('2026-02-01'), endDate: null })
    const rows: Array<{ cycleId: number; week: 1 | 2 | 3 }> = [
      { cycleId: cycle1, week: 1 }, { cycleId: cycle1, week: 2 }, { cycleId: cycle1, week: 3 },
      { cycleId: cycle2, week: 1 }, { cycleId: cycle2, week: 2 },
    ]
    for (let i = 0; i < rows.length; i++) {
      await seedAmrapSession({
        cycleId: rows[i].cycleId, liftId: lifts[0].id!, week: rows[i].week,
        amrapWeight: 200 + i, amrapReps: 5, date: new Date(2026, 0, 10 + i),
      })
    }
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toHaveLength(3)
    expect(result.map(r => r.weight)).toEqual([204, 203, 202])
  })

  it('dedups redos: only the newest completed session per cycle+week counts', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    // A redo leaves two completed rows for the same cycle+week. Only the newer
    // attempt should seed the window — otherwise one week's two AMRAPs crowd out
    // the other weeks and skew the median e1RM.
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 180, amrapReps: 5, date: new Date('2026-01-10') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 205, amrapReps: 8, date: new Date('2026-01-12') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 2, amrapWeight: 210, amrapReps: 6, date: new Date('2026-01-20') })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([
      { weight: 210, reps: 6 },  // week 2
      { weight: 205, reps: 8 },  // week 1, the redo (newer) — the 180 attempt is dropped
    ])
  })

  it('falls back to an older same-week attempt when the newest logged no AMRAP', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    // Older week-1 attempt with an AMRAP; a newer week-1 redo that logged none.
    // The newest attempt must not shadow the week's real data.
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 200, amrapReps: 7, date: new Date('2026-01-10') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, date: new Date('2026-01-12') })
    expect(await getRecentAmraps(db, lifts[0].id!)).toEqual([{ weight: 200, reps: 7 }])
  })

  it('honors an explicit window argument', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, amrapWeight: 195, amrapReps: 6, date: new Date('2026-01-10') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 2, amrapWeight: 210, amrapReps: 10, date: new Date('2026-01-20') })
    const result = await getRecentAmraps(db, lifts[0].id!, 1)
    expect(result).toEqual([{ weight: 210, reps: 10 }])
  })

  it('ignores pending sessions', async () => {
    const lifts = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedAmrapSession({ cycleId, liftId: lifts[0].id!, week: 1, status: 'pending', amrapWeight: 205 })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([])
  })

  it('ignores week-4 deload sessions', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 4, amrapWeight: 205 })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([])
  })

  it('skips completed sessions that have no AMRAP set', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 1, date: new Date('2026-01-05') })
    await seedAmrapSession({ cycleId: cycle1, liftId: lifts[0].id!, week: 2, amrapWeight: 205, amrapReps: 9, date: new Date('2026-01-15') })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([{ weight: 205, reps: 9 }])
  })

  it('uses the AMRAP set, not the first logged set of the session', async () => {
    const lifts = await seedLifts()
    const cycle1 = await db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId: cycle1, liftId: lifts[0].id!, week: 1, date: new Date('2026-01-10'), notes: null, status: 'completed',
    })
    // Non-AMRAP set inserted first — without the isAmrap filter, .first() returns it
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 130, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 205, reps: 9, isAmrap: true })
    const result = await getRecentAmraps(db, lifts[0].id!)
    expect(result).toEqual([{ weight: 205, reps: 9 }])
  })
})

// ─── 3-week cycle (hasDeloadWeek = false) ─────────────────────────────────────

describe('3-week cycle (hasDeloadWeek = false)', () => {
  const setNoDeload = () =>
    db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300, hasDeloadWeek: false })

  it('advanceCycleIfComplete advances after week 3 — no deload week needed', async () => {
    await setNoDeload()
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 3; w++) await addSessions(cycleId, w as 1 | 2 | 3, lifts)
    const { advanced, newTms } = await advanceCycleIfComplete(db)
    expect(advanced).toBe(true)
    expect(newTms).toHaveLength(4)
    const cycles = await db.cycles.toArray()
    expect(cycles).toHaveLength(2)
  })

  it('does not advance with only weeks 1–2 complete', async () => {
    await setNoDeload()
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await addSessions(cycleId, 1, lifts)
    await addSessions(cycleId, 2, lifts)
    const { advanced } = await advanceCycleIfComplete(db)
    expect(advanced).toBe(false)
  })

  it('getNextSessionAdvancingIfDone rolls into a new cycle once week 3 is done', async () => {
    await setNoDeload()
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 3; w++) await addSessions(cycleId, w as 1 | 2 | 3, lifts)
    const next = await getNextSessionAdvancingIfDone(db)
    expect(next.week).toBe(1)
    expect(await db.cycles.toArray()).toHaveLength(2)
  })

  it('default settings (deload on): week 3 complete does NOT advance — still owes week 4', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts, 200)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 3; w++) await addSessions(cycleId, w as 1 | 2 | 3, lifts)
    const { advanced } = await advanceCycleIfComplete(db)
    expect(advanced).toBe(false)
  })
})

// ─── advanceCycleIfComplete — doublingCandidates ──────────────────────────────

describe('advanceCycleIfComplete doublingCandidates', () => {
  it('returns doublingCandidates: [] on non-advanced path', async () => {
    const result = await advanceCycleIfComplete(db)
    expect(result.advanced).toBe(false)
    expect(result.doublingCandidates).toEqual([])
  })

  it('returns doublingCandidates: [] when cycle advances but no AMRAP sets logged', async () => {
    const lifts = await seedLifts()
    await seedTms(lifts)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (let w = 1; w <= 4; w++) await addSessions(cycleId, w as 1 | 2 | 3 | 4, lifts)
    const { advanced, doublingCandidates } = await advanceCycleIfComplete(db)
    expect(advanced).toBe(true)
    expect(doublingCandidates).toEqual([])
  })
})

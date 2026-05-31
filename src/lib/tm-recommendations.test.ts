// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import type { Lift, Cycle } from '../types/domain'
import { getSessionTmRecommendation, getCycleDoublingCandidates } from './tm-recommendations'

beforeEach(async () => { await __resetForTest() })

const LIFT_DEFS = [
  { name: 'OHP' as const,      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

async function seedLifts(): Promise<Lift[]> {
  await db.lifts.bulkAdd(LIFT_DEFS)
  return (await db.lifts.toArray() as Lift[]).sort((a: Lift, b: Lift) => a.order - b.order)
}

async function seedSessionWithAmrap(opts: {
  liftId: number
  week: 1 | 2 | 3 | 4
  weight: number
  reps: number
  isAmrap?: boolean
  cycleId?: number
}): Promise<{ sessionId: number; cycleId: number }> {
  const cycleId = opts.cycleId ?? await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const sessionId = await db.sessions.add({
    cycleId, liftId: opts.liftId, week: opts.week,
    date: new Date(), notes: null, status: 'completed',
  })
  await db.sets.add({
    sessionId, type: 'main', setNumber: 3,
    weight: opts.weight, reps: opts.reps,
    isAmrap: opts.isAmrap ?? true,
  })
  return { sessionId, cycleId }
}

// ─── getSessionTmRecommendation ───────────────────────────────────────────────
// Math reference (currentTm=200, week 3 AMRAP weight=190):
//   reps=9:  e1RM=247,   suggestedTm=220, delta=10%  → below 15% threshold
//   reps=10: e1RM=253.3, suggestedTm=230, delta=15%  → at threshold (triggers)
//   reps=11: e1RM=259.7, suggestedTm=235, delta=17.5%

describe('getSessionTmRecommendation', () => {
  it('returns null when no AMRAP set in session', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 10, isAmrap: false })
    expect(await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)).toBeNull()
  })

  it('returns null when AMRAP reps is 0', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 0 })
    expect(await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)).toBeNull()
  })

  it('returns null when no TM exists for lift', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 11 })
    expect(await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)).toBeNull()
  })

  it('returns null when delta < 15% (190 lbs × 9 reps → 10% delta)', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 9 })
    expect(await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)).toBeNull()
  })

  it('returns recommendation at exactly 15% delta (190 lbs × 10 reps → suggestedTm=230)', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 10 })
    const result = await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)
    expect(result).not.toBeNull()
    expect(result!.currentTm).toBe(200)
    expect(result!.suggestedTm).toBe(230)
    expect(result!.liftId).toBe(liftId)
    expect(result!.liftName).toBe(lifts[0].name)
  })

  it('suggestedTm is always a multiple of 5 (190 lbs × 11 reps → 235)', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 11 })
    const result = await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)
    expect(result!.suggestedTm).toBe(235)
    expect(result!.suggestedTm % 5).toBe(0)
  })

  it('uses most recent TM entry when multiple exist', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 150, setAt: new Date('2025-01-01') })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date('2026-01-01') })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 190, reps: 10 })
    const result = await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)
    expect(result!.currentTm).toBe(200)
  })

  it('works for week 1 AMRAP (85% weight, higher rep count to reach 15%)', async () => {
    // week 1 AMRAP at 170 lbs (85% of 200), need ~15% delta
    // reps=15: e1RM=170*(1+15/30)=255, suggestedTm=round(229.5/5)*5=230, delta=15% ✓
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 1, weight: 170, reps: 15 })
    const result = await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)
    expect(result).not.toBeNull()
    expect(result!.suggestedTm).toBe(230)
  })

  it('reps=1 AMRAP is valid — reps < 1 guard, not <= 1 (kills L31 EqualityOperator mutant)', async () => {
    // estimated1RM(w, 1) = w (exact, not Epley). weight=260: e1RM=260, suggestedTm=235, delta=17.5%>15%
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })
    const { sessionId } = await seedSessionWithAmrap({ liftId, week: 3, weight: 260, reps: 1 })
    const result = await getSessionTmRecommendation(db, sessionId, liftId, lifts[0].name)
    expect(result).not.toBeNull()
    expect(result!.suggestedTm).toBe(235)
  })
})

// ─── getCycleDoublingCandidates ───────────────────────────────────────────────
// Math reference (currentTm=200, no TM bump, TM set before cycle start):
//   Week 1 (170 lbs): reps=13 → e1RM=243.7, suggestedTm=220, delta=10% ✓
//                     reps=12 → e1RM=238,   suggestedTm=215, delta=7.5% ✗
//   Week 2 (180 lbs): reps=11 → e1RM=246,   suggestedTm=220, delta=10% ✓
//   Week 3 (190 lbs): reps=9  → e1RM=247,   suggestedTm=220, delta=10% ✓

describe('getCycleDoublingCandidates', () => {
  const CYCLE_START = new Date('2026-01-01T12:00:00.000Z')
  const TM_DATE    = new Date('2025-12-31T12:00:00.000Z')

  // All three working weeks at exactly 10% delta for currentTm=200
  const QUALIFYING_WEEKS = [
    { week: 1 as const, weight: 170, reps: 13 },
    { week: 2 as const, weight: 180, reps: 11 },
    { week: 3 as const, weight: 190, reps: 9 },
  ]

  async function buildCycle(opts: {
    liftId: number
    cycleStart?: Date
    tmWeight?: number
    tmDate?: Date
    extraTmDate?: Date
    weeks?: Array<{ week: 1 | 2 | 3 | 4; weight: number; reps: number; status?: 'completed' | 'skipped' }>
  }): Promise<Cycle> {
    const cycleStart = opts.cycleStart ?? CYCLE_START
    const cycleId = await db.cycles.add({ number: 1, startDate: cycleStart, endDate: null })
    await db.trainingMaxes.add({ liftId: opts.liftId, weight: opts.tmWeight ?? 200, setAt: opts.tmDate ?? TM_DATE })
    if (opts.extraTmDate) {
      await db.trainingMaxes.add({ liftId: opts.liftId, weight: (opts.tmWeight ?? 200) + 10, setAt: opts.extraTmDate })
    }
    for (const { week, weight, reps, status } of (opts.weeks ?? [])) {
      const sessionId = await db.sessions.add({
        cycleId, liftId: opts.liftId, week,
        date: new Date(cycleStart.getTime() + week * 86_400_000),
        notes: null, status: status ?? 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }
    return { id: cycleId, number: 1, startDate: cycleStart, endDate: null }
  }

  it('returns [] when no sessions exist', async () => {
    const lifts = await seedLifts()
    const cycle = await buildCycle({ liftId: lifts[0].id! })
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('returns [] when fewer than 3 working sessions for lift', async () => {
    const lifts = await seedLifts()
    const cycle = await buildCycle({
      liftId: lifts[0].id!,
      weeks: [
        { week: 1, weight: 170, reps: 13 },
        { week: 2, weight: 180, reps: 11 },
      ],
    })
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('returns [] when any week AMRAP delta < 10% (week 1 reps=12 → 7.5%)', async () => {
    const lifts = await seedLifts()
    const cycle = await buildCycle({
      liftId: lifts[0].id!,
      weeks: [
        { week: 1, weight: 170, reps: 12 }, // 7.5% — fails
        { week: 2, weight: 180, reps: 11 },
        { week: 3, weight: 190, reps: 9 },
      ],
    })
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('returns candidate when all 3 weeks ≥ 10% delta and no TM bump', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const cycle = await buildCycle({ liftId, weeks: QUALIFYING_WEEKS })
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
    expect(result[0].liftId).toBe(liftId)
    expect(result[0].liftName).toBe(lifts[0].name)
    expect(result[0].progressionIncrement).toBe(5)
  })

  it('returns [] when a mid-cycle TM bump occurred (>60s after cycle start)', async () => {
    const lifts = await seedLifts()
    const bumpDate = new Date(CYCLE_START.getTime() + 120_000) // 2 min after start
    const cycle = await buildCycle({
      liftId: lifts[0].id!,
      weeks: QUALIFYING_WEEKS,
      extraTmDate: bumpDate,
    })
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('does not treat auto-progression TM (within 60s of cycle start) as a bump', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    // TM set at cycle start (simulates auto-progression): within tolerance window
    const progressionTmDate = new Date(CYCLE_START.getTime() + 100) // 100ms after — same transaction
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: progressionTmDate })
    for (const { week, weight, reps } of QUALIFYING_WEEKS) {
      const sessionId = await db.sessions.add({
        cycleId, liftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }
    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
  })

  it('ignores week-4 sessions — still requires 3 working weeks', async () => {
    const lifts = await seedLifts()
    const cycle = await buildCycle({
      liftId: lifts[0].id!,
      weeks: [
        { week: 1, weight: 170, reps: 13 },
        { week: 2, weight: 180, reps: 11 },
        { week: 4, weight: 100, reps: 5 }, // deload, should not count
      ],
    })
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('returns [] when AMRAP sets logged 0 reps', async () => {
    const lifts = await seedLifts()
    const cycle = await buildCycle({
      liftId: lifts[0].id!,
      weeks: [
        { week: 1, weight: 170, reps: 0 },
        { week: 2, weight: 180, reps: 0 },
        { week: 3, weight: 190, reps: 0 },
      ],
    })
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('returns only qualifying lifts when multiple lifts exist', async () => {
    const lifts = await seedLifts()
    const [lift0, lift1] = lifts
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId: lift0.id!, weight: 200, setAt: TM_DATE })
    await db.trainingMaxes.add({ liftId: lift1.id!, weight: 200, setAt: TM_DATE })

    // lift0: all 3 weeks qualify
    for (const { week, weight, reps } of QUALIFYING_WEEKS) {
      const sessionId = await db.sessions.add({
        cycleId, liftId: lift0.id!, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }

    // lift1: week 1 fails (reps=12 → 7.5% delta)
    for (const { week, weight, reps } of [
      { week: 1 as const, weight: 170, reps: 12 },
      { week: 2 as const, weight: 180, reps: 11 },
      { week: 3 as const, weight: 190, reps: 9 },
    ]) {
      const sessionId = await db.sessions.add({
        cycleId, liftId: lift1.id!, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }

    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
    expect(result[0].liftId).toBe(lift0.id)
  })

  it('counts skipped sessions as missing AMRAP data (no sets)', async () => {
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: TM_DATE })

    // 2 qualifying sessions + 1 skipped (no sets)
    for (const { week, weight, reps } of QUALIFYING_WEEKS.slice(0, 2)) {
      const sessionId = await db.sessions.add({
        cycleId, liftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }
    // week 3 skipped — no AMRAP set added
    await db.sessions.add({
      cycleId, liftId, week: 3,
      date: new Date(CYCLE_START.getTime() + 3 * 86_400_000),
      notes: null, status: 'skipped',
    })

    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    expect(await getCycleDoublingCandidates(db, cycle)).toEqual([])
  })

  it('uses the MOST RECENT TM before cycle start, not the oldest (kills L72 .reverse() mutant)', async () => {
    // Old TM (weight=220): delta=(220-220)/220=0% → would NOT qualify
    // New TM (weight=200): delta=(220-200)/200=10% → qualifies
    // Without .reverse(), find() returns the oldest TM first → no candidate
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId, weight: 220, setAt: new Date('2025-11-01T12:00:00Z') })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: TM_DATE })
    for (const { week, weight, reps } of QUALIFYING_WEEKS) {
      const sessionId = await db.sessions.add({
        cycleId, liftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }
    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
  })

  it('TM at exactly cycle start + 60s is NOT a bump and IS a valid cycleTm (kills L68 >= and L73 < boundary mutants)', async () => {
    // CYCLE_START_TOLERANCE_MS = 60_000
    // L68: `> tolerance` — exact boundary should NOT be a bump (>), mutant `>=` would flag as bump
    // L73: `<= tolerance` — exact boundary should be found as cycleTm (<=), mutant `<` would exclude it
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const exactBoundary = new Date(CYCLE_START.getTime() + 60_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: exactBoundary })
    for (const { week, weight, reps } of QUALIFYING_WEEKS) {
      const sessionId = await db.sessions.add({
        cycleId, liftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }
    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
  })

  it('only main AMRAP sets determine doubling eligibility — non-AMRAP main sets are excluded (kills L80 || mutant)', async () => {
    // With `|| isAmrap` mutation, find() picks the first main set (non-amrap, low reps)
    // whose e1RM gives negative delta → allOver=false → no candidate
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: TM_DATE })
    for (const { week, weight, reps } of QUALIFYING_WEEKS) {
      const sessionId = await db.sessions.add({
        cycleId, liftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      // Non-AMRAP main set first (low reps → negative delta)
      await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight, reps: 3, isAmrap: false })
      // AMRAP set with qualifying reps
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }
    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
  })

  it('reps=1 per session is valid (reps < 1 guard, not <= 1) (kills L81 EqualityOperator mutant)', async () => {
    // estimated1RM(w, 1) = w. weight=245: e1RM=245, suggestedTm=roundToNearest5(220.5)=220, delta=10%
    const lifts = await seedLifts()
    const liftId = lifts[0].id!
    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: TM_DATE })
    for (const week of [1, 2, 3] as const) {
      const sessionId = await db.sessions.add({
        cycleId, liftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 245, reps: 1, isAmrap: true })
    }
    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)
    expect(result).toHaveLength(1)
  })

  it('skips sessions whose liftId is absent from lifts table (orphaned FK — defensive guard)', async () => {
    // Covers the `if (!lift) continue` guard at the end of getCycleDoublingCandidates.
    // A session row referencing liftId=9999 (not in db.lifts) should be silently skipped;
    // a valid lift in the same cycle still qualifies.
    //
    // Math: TM=200, week 1 weight=170 reps=13 → delta 10% ✓ (same as QUALIFYING_WEEKS)
    const lifts = await seedLifts()
    const validLiftId = lifts[0].id!
    const orphanLiftId = 9999

    const cycleId = await db.cycles.add({ number: 1, startDate: CYCLE_START, endDate: null })
    await db.trainingMaxes.add({ liftId: validLiftId, weight: 200, setAt: TM_DATE })
    // TM for the orphan id — needed so hasBump/cycleTm checks run, reaching the lift lookup
    await db.trainingMaxes.add({ liftId: orphanLiftId, weight: 200, setAt: TM_DATE })

    for (const { week, weight, reps } of QUALIFYING_WEEKS) {
      const validSid = await db.sessions.add({
        cycleId, liftId: validLiftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId: validSid, type: 'main', setNumber: 3, weight, reps, isAmrap: true })

      const orphanSid = await db.sessions.add({
        cycleId, liftId: orphanLiftId, week,
        date: new Date(CYCLE_START.getTime() + week * 86_400_000),
        notes: null, status: 'completed',
      })
      await db.sets.add({ sessionId: orphanSid, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }

    const cycle: Cycle = { id: cycleId, number: 1, startDate: CYCLE_START, endDate: null }
    const result = await getCycleDoublingCandidates(db, cycle)

    expect(result).toHaveLength(1)
    expect(result[0].liftId).toBe(validLiftId)
  })
})

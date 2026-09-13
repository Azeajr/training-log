// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import { detectPRs, prSessionIds } from './pr'

beforeEach(async () => { await __resetForTest() })

async function addSession(liftId: number) {
  return db.sessions.add({
    cycleId: 1, liftId, week: 1, date: new Date(),
    notes: null, status: 'completed',
  })
}

async function addAmrap(sessionId: number, weight: number, reps: number) {
  return db.sets.add({
    sessionId, type: 'main', setNumber: 3,
    weight, reps, isAmrap: true,
  })
}

describe('detectPRs', () => {
  it('returns no PR when no prior sessions exist for the lift', async () => {
    const result = await detectPRs(db, 1, 200, 5)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('scores against non-AMRAP work too — a light prior top set is still history', async () => {
    const sid = await addSession(1)
    await db.sets.add({ sessionId: sid, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    const result = await detectPRs(db, 1, 200, 5)
    expect(result.repPr).toBe(false)  // nothing prior at 200
    expect(result.e1RmPr).toBe(true)  // 200x5 clears the 100x5 baseline
  })

  it('detects rep PR — more reps at same weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    const result = await detectPRs(db, 1, 200, 6)
    expect(result.repPr).toBe(true)
    expect(result.e1RmPr).toBe(true)
  })

  it('does not flag rep PR for a first-time-at-weight set, but does flag e1RM PR', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    const result = await detectPRs(db, 1, 220, 6)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)
  })

  it('does not flag rep PR when reps tie prior best at same weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    const result = await detectPRs(db, 1, 200, 5)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('detects e1RM PR at lighter weight with more reps', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)  // e1RM ~ 233
    const result = await detectPRs(db, 1, 180, 10)  // e1RM = 240
    expect(result.repPr).toBe(false)  // no prior at exactly 180lb
    expect(result.e1RmPr).toBe(true)
  })

  it('isolates by liftId — other lifts do not influence the result', async () => {
    const otherSid = await addSession(2)
    await addAmrap(otherSid, 400, 10)  // huge PR on lift 2
    const result = await detectPRs(db, 1, 200, 5)  // fresh AMRAP on lift 1
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('excludes the just-saved set when excludeSetId is given — first-ever AMRAP yields e1RmPr', async () => {
    const sid = await addSession(1)
    const savedId = await addAmrap(sid, 200, 5)
    // Excluding the only AMRAP means no prior data → treated as first-ever PR.
    const result = await detectPRs(db, 1, 200, 5, savedId)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)
  })

  it('reports prevBestReps when prior sets exist at the exact weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 7)
    const result = await detectPRs(db, 1, 200, 8)
    expect(result.prevBestReps).toBe(7)
    expect(result.repPr).toBe(true)
  })

  it('omits prevBestReps when no prior set exists at the exact weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 150, 10)
    const result = await detectPRs(db, 1, 200, 3)
    expect(result.prevBestReps).toBeUndefined()
    expect(result.repPr).toBe(false)
  })

  it('counts non-AMRAP sets when computing prevBestReps and e1RmPr', async () => {
    const sid = await addSession(1)
    // A non-amrap top set at the same weight, heavier on reps than the AMRAP.
    // The old AMRAP-only filter ignored it and called 7 reps a record.
    await db.sets.add({ sessionId: sid, type: 'main', setNumber: 1, weight: 200, reps: 10, isAmrap: false })
    await addAmrap(sid, 200, 5)
    const result = await detectPRs(db, 1, 200, 7)
    expect(result.prevBestReps).toBe(10)
    expect(result.repPr).toBe(false)
  })

  it('a joker takes the record when it outscores every prior set', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)  // e1RM ≈ 233
    // Joker chained above the top set: 250x3 ≈ 272.5
    const result = await detectPRs(db, 1, 250, 3)
    expect(result.e1RmPr).toBe(true)
  })

  it('a prior joker blocks a weaker AMRAP from claiming a record', async () => {
    const sid1 = await addSession(1)
    await db.sets.add({ sessionId: sid1, type: 'joker', setNumber: 1, weight: 250, reps: 3, isAmrap: false })
    // Scored against AMRAP-only history the joker is invisible and this would
    // read as a first-ever baseline PR — the false positive that makes widening
    // the trigger without the baseline worse than leaving both alone.
    const result = await detectPRs(db, 1, 200, 5)
    expect(result.e1RmPr).toBe(false)
    expect(result.prevBestE1Rm).toBeCloseTo(272.5, 0)
  })

  it('a cross block scores against the movement it trains, not the session lift', async () => {
    // Lift 1's session carries a heavy cross block for lift 2.
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    await db.sets.add({ sessionId: sid, type: 'cross', setNumber: 1, weight: 400, reps: 5, isAmrap: false, liftId: 2 })
    // Lift 1's own history is untouched by it...
    expect((await detectPRs(db, 1, 300, 5)).e1RmPr).toBe(true)
    // ...and lift 2 is measured against it.
    const sid2 = await addSession(2)
    await addAmrap(sid2, 100, 5)
    expect((await detectPRs(db, 2, 300, 5)).e1RmPr).toBe(false)
  })

  it('prevBestReps is the MAX reps at the same weight, not min (kills L49 MethodExpression mutant)', async () => {
    const sid1 = await addSession(1)
    const sid2 = await addSession(1)
    await addAmrap(sid1, 200, 5)
    await addAmrap(sid2, 200, 9)
    // 8 < max(5,9)=9 → repPr=false; with Math.min(5,9)=5 it would be true
    const result = await detectPRs(db, 1, 200, 8)
    expect(result.prevBestReps).toBe(9)
    expect(result.repPr).toBe(false)
  })

  it('e1RmPr compares against the MAX prior e1RM, not min (kills L53 MethodExpression mutant)', async () => {
    const sid1 = await addSession(1)
    const sid2 = await addSession(1)
    await addAmrap(sid1, 200, 5)  // e1RM ≈ 233
    await addAmrap(sid2, 150, 3)  // e1RM ≈ 165 (much lower)
    // new e1RM at 180×4 ≈ 204 — between min(165) and max(233)
    // with Math.max: 204 < 233 → e1RmPr=false; with Math.min: 204 > 165 → e1RmPr=true
    const result = await detectPRs(db, 1, 180, 4)
    expect(result.e1RmPr).toBe(false)
  })

  it('excludeSetId only removes that set; other prior AMRAPs still in history (kills L41 ArrowFunction mutant)', async () => {
    const sid1 = await addSession(1)
    const sid2 = await addSession(1)
    await addAmrap(sid1, 200, 8)                   // prior AMRAP, not excluded
    const savedId = await addAmrap(sid2, 200, 5)   // just-saved, to be excluded
    // Compare new(200×3) vs prior(200×8) only — newE1RM < prevBestE1RM → not a PR
    const result = await detectPRs(db, 1, 200, 3, savedId)
    expect(result.e1RmPr).toBe(false)
    expect(result.repPr).toBe(false)
  })

  it('first recorded work returns undefined prevBestE1Rm (kills L43 BlockStatement mutant)', async () => {
    const sid = await addSession(1)
    // Session exists but logged only warmups, which are never performances.
    await db.sets.add({ sessionId: sid, type: 'warmup', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    const result = await detectPRs(db, 1, 200, 5)
    expect(result.e1RmPr).toBe(true)
    // Early return path yields no prevBestE1Rm; computing Math.max() would give -Infinity
    expect(result.prevBestE1Rm).toBeUndefined()
  })

  it('0-rep set is never a PR — even as the first recorded work for the lift', async () => {
    const sid = await addSession(1)
    await db.sets.add({ sessionId: sid, type: 'warmup', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    // Failed AMRAP: estimated1RM(weight, 0) === weight must not set a baseline e1RM record
    const result = await detectPRs(db, 1, 170, 0)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('prior 0-rep AMRAPs are not records — the next real AMRAP is still the baseline PR', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 300, 0)  // failed set; estimated1RM(300, 0) = 300 must not become prevBest
    const result = await detectPRs(db, 1, 200, 5)  // e1RM ≈ 233
    expect(result.e1RmPr).toBe(true)
    expect(result.prevBestE1Rm).toBeUndefined()
  })

  it('prior 0-rep AMRAP at the same weight provides no prevBestReps', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 0)
    const result = await detectPRs(db, 1, 200, 1)
    expect(result.prevBestReps).toBeUndefined()
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)  // first completed AMRAP → baseline
  })

  it('1-rep prior AMRAP IS a record — boundary of the reps >= 1 filter (kills L42 >= → > mutant)', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 1)  // e1RM = 200 via the reps===1 short-circuit
    const result = await detectPRs(db, 1, 200, 3)  // e1RM = 220
    // With `reps > 1` the prior would be filtered out: prevBestReps undefined, no record
    expect(result.prevBestReps).toBe(1)
    expect(result.prevBestE1Rm).toBe(200)
    expect(result.repPr).toBe(true)
    expect(result.e1RmPr).toBe(true)
  })

  it('1-rep prior AMRAP blocks a lower e1RM from claiming a baseline PR', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 300, 1)  // e1RM = 300 — must remain the standing record
    const result = await detectPRs(db, 1, 200, 5)  // e1RM ≈ 233
    expect(result.e1RmPr).toBe(false)
    expect(result.prevBestE1Rm).toBe(300)
  })
})

// History badges the session that set a record, evaluated against prior work
// only — a bigger AMRAP six weeks later must not un-PR the one that stood.
describe('prSessionIds', () => {
  const rec = (sessionId: number, day: number, weight: number, reps: number, liftId = 1) => ({
    sessionId, liftId, date: new Date(2026, 0, day), weight, reps,
  })

  it('marks a lift first successful session as the baseline record', () => {
    expect([...prSessionIds([rec(1, 1, 200, 5)])]).toEqual([1])
  })

  it('marks an e1RM improvement and leaves a regression unmarked', () => {
    const out = prSessionIds([rec(1, 1, 200, 5), rec(2, 8, 200, 8), rec(3, 15, 200, 3)])
    expect(out.has(1)).toBe(true)
    expect(out.has(2)).toBe(true)
    expect(out.has(3)).toBe(false)
  })

  it('a heavier load that estimates lower is not a record', () => {
    // 200x10 estimates to ~269.5; the later 250x1 estimates to a flat 250
    // (reps === 1 short-circuits). Heaviest weight moved is a stat the log
    // keeps, not a claim about strength, so the badge stays off.
    const out = prSessionIds([rec(1, 1, 200, 10), rec(2, 8, 250, 1)])
    expect(out.has(2)).toBe(false)
  })

  it('leaves a session that does not improve the e1RM unmarked', () => {
    const out = prSessionIds([rec(1, 1, 300, 3), rec(2, 8, 200, 12), rec(3, 15, 200, 5)])
    expect(out.has(2)).toBe(false)
    expect(out.has(3)).toBe(false)
  })

  it('folds a session to its best set — a joker carries the whole session', () => {
    // Session 2's own top set is a regression; the joker logged alongside it
    // estimates above session 1, so the session takes the record.
    const out = prSessionIds([
      rec(1, 1, 250, 5),
      rec(2, 8, 200, 3), rec(2, 8, 275, 3),
    ])
    expect(out.has(2)).toBe(true)
  })

  it('ignores 0lb rows the way every other e1RM read does', () => {
    expect([...prSessionIds([rec(1, 1, 0, 8)])]).toEqual([])
  })

  it('does not let a later session retroactively un-PR an earlier one', () => {
    const out = prSessionIds([rec(1, 1, 200, 5), rec(2, 30, 250, 8)])
    expect(out.has(1)).toBe(true)
    expect(out.has(2)).toBe(true)
  })

  it('scores each lift against its own history', () => {
    const out = prSessionIds([rec(1, 1, 400, 5, 2), rec(2, 8, 200, 5, 1)])
    expect(out.has(2)).toBe(true)
  })

  it('ignores failed (0-rep) sets', () => {
    expect([...prSessionIds([rec(1, 1, 200, 0)])]).toEqual([])
  })

  it('orders same-day sessions by id so the earlier one takes the baseline', () => {
    const out = prSessionIds([rec(2, 1, 200, 8), rec(1, 1, 200, 5)])
    expect(out.has(1)).toBe(true)
    expect(out.has(2)).toBe(true)
    expect([...prSessionIds([rec(2, 1, 200, 5), rec(1, 1, 200, 8)])].sort()).toEqual([1])
  })
})

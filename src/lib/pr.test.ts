// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import { detectAmrapPRs } from './pr'

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

describe('detectAmrapPRs', () => {
  it('returns no PR when no prior sessions exist for the lift', async () => {
    const result = await detectAmrapPRs(db, 1, 200, 5)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('returns e1RmPr when prior sessions exist but no prior AMRAP sets (first-ever AMRAP)', async () => {
    const sid = await addSession(1)
    await db.sets.add({ sessionId: sid, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    const result = await detectAmrapPRs(db, 1, 200, 5)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)
  })

  it('detects rep PR — more reps at same weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    const result = await detectAmrapPRs(db, 1, 200, 6)
    expect(result.repPr).toBe(true)
    expect(result.e1RmPr).toBe(true)
  })

  it('does not flag rep PR for a first-time-at-weight set, but does flag e1RM PR', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    const result = await detectAmrapPRs(db, 1, 220, 6)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)
  })

  it('does not flag rep PR when reps tie prior best at same weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)
    const result = await detectAmrapPRs(db, 1, 200, 5)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('detects e1RM PR at lighter weight with more reps', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 5)  // e1RM ~ 233
    const result = await detectAmrapPRs(db, 1, 180, 10)  // e1RM = 240
    expect(result.repPr).toBe(false)  // no prior at exactly 180lb
    expect(result.e1RmPr).toBe(true)
  })

  it('isolates by liftId — other lifts do not influence the result', async () => {
    const otherSid = await addSession(2)
    await addAmrap(otherSid, 400, 10)  // huge PR on lift 2
    const result = await detectAmrapPRs(db, 1, 200, 5)  // fresh AMRAP on lift 1
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('excludes the just-saved set when excludeSetId is given — first-ever AMRAP yields e1RmPr', async () => {
    const sid = await addSession(1)
    const savedId = await addAmrap(sid, 200, 5)
    // Excluding the only AMRAP means no prior data → treated as first-ever PR.
    const result = await detectAmrapPRs(db, 1, 200, 5, savedId)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)
  })

  it('reports prevBestReps when prior sets exist at the exact weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 7)
    const result = await detectAmrapPRs(db, 1, 200, 8)
    expect(result.prevBestReps).toBe(7)
    expect(result.repPr).toBe(true)
  })

  it('omits prevBestReps when no prior set exists at the exact weight', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 150, 10)
    const result = await detectAmrapPRs(db, 1, 200, 3)
    expect(result.prevBestReps).toBeUndefined()
    expect(result.repPr).toBe(false)
  })

  it('ignores non-AMRAP sets when computing prevBestReps and e1RmPr (kills L36 filter mutant)', async () => {
    const sid = await addSession(1)
    // Non-amrap set at same weight with more reps — should NOT count as prior best
    await db.sets.add({ sessionId: sid, type: 'main', setNumber: 1, weight: 200, reps: 10, isAmrap: false })
    await addAmrap(sid, 200, 5)  // amrap set — only this counts
    // 7 reps > amrap max(5) → repPr=true; would be false if non-amrap reps=10 were included
    const result = await detectAmrapPRs(db, 1, 200, 7)
    expect(result.repPr).toBe(true)
    expect(result.prevBestReps).toBe(5)
  })

  it('prevBestReps is the MAX reps at the same weight, not min (kills L49 MethodExpression mutant)', async () => {
    const sid1 = await addSession(1)
    const sid2 = await addSession(1)
    await addAmrap(sid1, 200, 5)
    await addAmrap(sid2, 200, 9)
    // 8 < max(5,9)=9 → repPr=false; with Math.min(5,9)=5 it would be true
    const result = await detectAmrapPRs(db, 1, 200, 8)
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
    const result = await detectAmrapPRs(db, 1, 180, 4)
    expect(result.e1RmPr).toBe(false)
  })

  it('excludeSetId only removes that set; other prior AMRAPs still in history (kills L41 ArrowFunction mutant)', async () => {
    const sid1 = await addSession(1)
    const sid2 = await addSession(1)
    await addAmrap(sid1, 200, 8)                   // prior AMRAP, not excluded
    const savedId = await addAmrap(sid2, 200, 5)   // just-saved, to be excluded
    // Compare new(200×3) vs prior(200×8) only — newE1RM < prevBestE1RM → not a PR
    const result = await detectAmrapPRs(db, 1, 200, 3, savedId)
    expect(result.e1RmPr).toBe(false)
    expect(result.repPr).toBe(false)
  })

  it('first-ever AMRAP (no prior amrap sets) returns undefined prevBestE1Rm (kills L43 BlockStatement mutant)', async () => {
    const sid = await addSession(1)
    // Session exists but has only non-amrap sets
    await db.sets.add({ sessionId: sid, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    const result = await detectAmrapPRs(db, 1, 200, 5)
    expect(result.e1RmPr).toBe(true)
    // Early return path yields no prevBestE1Rm; computing Math.max() would give -Infinity
    expect(result.prevBestE1Rm).toBeUndefined()
  })

  it('0-rep AMRAP is never a PR — even as the first-ever AMRAP for the lift', async () => {
    const sid = await addSession(1)
    await db.sets.add({ sessionId: sid, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    // Failed AMRAP: estimated1RM(weight, 0) === weight must not set a baseline e1RM record
    const result = await detectAmrapPRs(db, 1, 170, 0)
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(false)
  })

  it('prior 0-rep AMRAPs are not records — the next real AMRAP is still the baseline PR', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 300, 0)  // failed set; estimated1RM(300, 0) = 300 must not become prevBest
    const result = await detectAmrapPRs(db, 1, 200, 5)  // e1RM ≈ 233
    expect(result.e1RmPr).toBe(true)
    expect(result.prevBestE1Rm).toBeUndefined()
  })

  it('prior 0-rep AMRAP at the same weight provides no prevBestReps', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 0)
    const result = await detectAmrapPRs(db, 1, 200, 1)
    expect(result.prevBestReps).toBeUndefined()
    expect(result.repPr).toBe(false)
    expect(result.e1RmPr).toBe(true)  // first completed AMRAP → baseline
  })

  it('1-rep prior AMRAP IS a record — boundary of the reps >= 1 filter (kills L42 >= → > mutant)', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 200, 1)  // e1RM = 200 via the reps===1 short-circuit
    const result = await detectAmrapPRs(db, 1, 200, 3)  // e1RM = 220
    // With `reps > 1` the prior would be filtered out: prevBestReps undefined, no record
    expect(result.prevBestReps).toBe(1)
    expect(result.prevBestE1Rm).toBe(200)
    expect(result.repPr).toBe(true)
    expect(result.e1RmPr).toBe(true)
  })

  it('1-rep prior AMRAP blocks a lower e1RM from claiming a baseline PR', async () => {
    const sid = await addSession(1)
    await addAmrap(sid, 300, 1)  // e1RM = 300 — must remain the standing record
    const result = await detectAmrapPRs(db, 1, 200, 5)  // e1RM ≈ 233
    expect(result.e1RmPr).toBe(false)
    expect(result.prevBestE1Rm).toBe(300)
  })
})

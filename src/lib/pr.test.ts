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
})

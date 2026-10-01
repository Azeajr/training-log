// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import {
  createLift, updateLift, archiveLift, unarchiveLift, moveLift, deleteLift,
  addLiftSupplemental, updateLiftSupplemental, removeLiftSupplemental,
  liftsCrossReferencing, loadCrossPlan,
} from './lift'
import { setTm } from './training-max'

beforeEach(async () => { await __resetForTest() })

describe('createLift', () => {
  it('creates an active lift with the next order', async () => {
    await db.lifts.add({ name: 'A', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id = await createLift(db, { name: 'B', progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    const lift = await db.lifts.get(id)
    expect(lift?.order).toBe(2)
    expect(lift?.archived).toBe(false)
  })

  it('orders the first lift at 1', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    expect((await db.lifts.get(id))?.order).toBe(1)
  })
})

describe('updateLift', () => {
  it('patches name and increment', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await updateLift(db, id, { name: 'Front Squat', progressionIncrement: 10 })
    const lift = await db.lifts.get(id)
    expect(lift?.name).toBe('Front Squat')
    expect(lift?.progressionIncrement).toBe(10)
  })
})

describe('archiveLift', () => {
  it('archives, deletes pending sessions, keeps completed history', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const pending = await db.sessions.add({ cycleId, liftId: id, week: 2, date: new Date(), notes: null, status: 'pending' })
    const done = await db.sessions.add({ cycleId, liftId: id, week: 1, date: new Date(), notes: null, status: 'completed' })

    await archiveLift(db, id)

    expect((await db.lifts.get(id))?.archived).toBe(true)
    expect(await db.sessions.get(pending)).toBeUndefined()
    expect(await db.sessions.get(done)).toBeDefined()
  })

  it('unarchive restores it to the active roster', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await archiveLift(db, id)
    await unarchiveLift(db, id)
    expect((await db.lifts.get(id))?.archived).toBe(false)
  })

  it('keeps cross blocks that use the lift as movement by default', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 5, reps: 10 })

    await archiveLift(db, mov)

    expect(await db.liftSupplementals.where('movementLiftId').equals(mov).toArray()).toHaveLength(1)
  })

  it('removes cross blocks pointing at the lift when removeCrossRefs is set', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 5, reps: 10 })

    await archiveLift(db, mov, { removeCrossRefs: true })

    expect(await db.liftSupplementals.where('movementLiftId').equals(mov).toArray()).toHaveLength(0)
  })
})

describe('liftsCrossReferencing', () => {
  it('returns active day names that use the lift as their cross movement', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 5, reps: 10 })

    expect(await liftsCrossReferencing(db, mov)).toEqual(['Bench'])
  })

  it('returns empty when nothing references the lift', async () => {
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    expect(await liftsCrossReferencing(db, mov)).toEqual([])
  })

  it('ignores archived days', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 5, reps: 10 })
    await archiveLift(db, day)

    expect(await liftsCrossReferencing(db, mov)).toEqual([])
  })
})

describe('moveLift', () => {
  it('swaps order with the adjacent active lift', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const b = await createLift(db, { name: 'B', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const aOrder = (await db.lifts.get(a))!.order
    const bOrder = (await db.lifts.get(b))!.order

    await moveLift(db, b, 'up')

    expect((await db.lifts.get(a))?.order).toBe(bOrder)
    expect((await db.lifts.get(b))?.order).toBe(aOrder)
  })

  it('is a no-op at the top boundary (first lift, up)', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const before = (await db.lifts.get(a))!.order
    await moveLift(db, a, 'up')
    expect((await db.lifts.get(a))?.order).toBe(before)
  })

  it('is a no-op at the bottom boundary (last lift, down)', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const b = await createLift(db, { name: 'B', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const aOrder = (await db.lifts.get(a))!.order
    const bOrder = (await db.lifts.get(b))!.order
    await moveLift(db, b, 'down') // swapIdx === active.length → return
    expect((await db.lifts.get(a))?.order).toBe(aOrder)
    expect((await db.lifts.get(b))?.order).toBe(bOrder)
  })

  it('swaps across an archived lift in the middle (kills L49 active-filter mutant)', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mid = await createLift(db, { name: 'Mid', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const c = await createLift(db, { name: 'C', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await archiveLift(db, mid)
    const aOrder = (await db.lifts.get(a))!.order
    const cOrder = (await db.lifts.get(c))!.order
    // Active roster is [A, C]; moving A down must swap with C, not the archived
    // Mid that sits between them by order.
    await moveLift(db, a, 'down')
    expect((await db.lifts.get(a))?.order).toBe(cOrder)
    expect((await db.lifts.get(c))?.order).toBe(aOrder)
  })

  it('is a no-op when the lift id is not in the active roster', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const before = (await db.lifts.get(a))!.order
    await moveLift(db, 9999, 'up') // idx === -1 → return, leaves roster untouched
    expect((await db.lifts.get(a))?.order).toBe(before)
  })
})

describe('cross-lift supplemental CRUD', () => {
  it('adds blocks with incrementing order and round-trips fields', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    // Two different movements: one block per (lift, movement) is a unique index
    // now, because a logged cross set carries only the movement and would
    // otherwise drive both blocks at once (F31).
    const mov2 = await createLift(db, { name: 'Row', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id1 = await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'percent', percent: 0.7, sets: 5, reps: 10 })
    const id2 = await addLiftSupplemental(db, { liftId: day, movementLiftId: mov2, weightMode: 'fsl', percent: null, sets: 3, reps: 8 })

    const b1 = await db.liftSupplementals.get(id1)
    expect(b1?.order).toBe(0)
    expect(b1?.percent).toBe(0.7)
    expect((await db.liftSupplementals.get(id2))?.order).toBe(1)
  })

  it('updates and removes a block', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id = await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 5, reps: 10 })

    await updateLiftSupplemental(db, id, { sets: 3, reps: 12 })
    const b = await db.liftSupplementals.get(id)
    expect(b?.sets).toBe(3)
    expect(b?.reps).toBe(12)

    await removeLiftSupplemental(db, id)
    expect(await db.liftSupplementals.get(id)).toBeUndefined()
  })
})

// Today's preview and the Workout screen each carried their own copy of this
// loop, and the copies disagreed on a block with no sets — so the one loader
// has to settle every rule the two used to decide separately.
describe('loadCrossPlan', () => {
  const opts = { deloadSupplemental: 'normal' as const, barWeight: 45, crossLiftSupplemental: true }

  const seed = async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const ohp = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const row = await createLift(db, { name: 'Row', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await setTm(db, ohp, 100)
    await setTm(db, row, 200)
    const ohpBlock = await addLiftSupplemental(db, { liftId: day, movementLiftId: ohp, weightMode: 'percent', percent: 0.5, sets: 5, reps: 10 })
    const rowBlock = await addLiftSupplemental(db, { liftId: day, movementLiftId: row, weightMode: 'fsl', percent: null, sets: 3, reps: 5 })
    return { day, ohp, row, ohpBlock, rowBlock }
  }

  it('computes each block from its movement TM, in block order', async () => {
    const { day, ohpBlock } = await seed()
    // Insertion order is OHP then Row; `order`, not insertion, decides.
    await updateLiftSupplemental(db, ohpBlock, { order: 5 })

    const plan = await loadCrossPlan(db, day, 1, opts)
    expect(plan.map(p => p.movement.name)).toEqual(['Row', 'OHP'])
    // Row: FSL = week-1 first main set, 65% of 200.
    expect(plan[0].sets).toHaveLength(3)
    expect(plan[0].sets[0]).toMatchObject({ weight: 130, reps: 5, type: 'cross' })
    // OHP: straight 50% of 100.
    expect(plan[1].sets).toHaveLength(5)
    expect(plan[1].sets[0]).toMatchObject({ weight: 50, reps: 10 })
  })

  it('follows the deload-week supplemental setting', async () => {
    const { day } = await seed()
    expect(await loadCrossPlan(db, day, 4, { ...opts, deloadSupplemental: 'skip' })).toEqual([])
    // normal → week-1 loading; deload → week-4 loading (40% of 200).
    const normal = await loadCrossPlan(db, day, 4, opts)
    expect(normal.find(p => p.movement.name === 'Row')?.sets[0].weight).toBe(130)
    const deload = await loadCrossPlan(db, day, 4, { ...opts, deloadSupplemental: 'deload' })
    expect(deload.find(p => p.movement.name === 'Row')?.sets[0].weight).toBe(80)
  })

  it('leaves out a block with no sets and one whose movement lift is gone', async () => {
    const { day, ohpBlock } = await seed()
    // The setup stepper stops at 1; a zero only arrives by import or an old row.
    await updateLiftSupplemental(db, ohpBlock, { sets: 0 })
    await db.liftSupplementals.add({ liftId: day, movementLiftId: 999, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 9 })

    const plan = await loadCrossPlan(db, day, 1, opts)
    expect(plan.map(p => p.movement.name)).toEqual(['Row'])
  })

  it('runs no block with cross-lift switched off in Settings', async () => {
    const { day } = await seed()
    expect(await loadCrossPlan(db, day, 1, { ...opts, crossLiftSupplemental: false })).toEqual([])
  })

  it('is empty for a day with no blocks', async () => {
    const { ohp } = await seed()
    expect(await loadCrossPlan(db, ohp, 1, opts)).toEqual([])
  })
})

// ── F99 / F44 ───────────────────────────────────────────────────────────────
// Two paths delete a session's parent and only one is a complete cascade.
// discardPendingSession deletes sets, accessorySets, accessoryNotes AND the row;
// archiveLift deleted only the row, and deleteLift deleted neither the sessions
// nor their children. The orphans then had a sessionId nothing resolves — and
// until F43's reader fix they scored permanent records no screen could display.
describe('deleting a lift leaves no orphaned child rows', () => {
  async function liftWithPendingWork() {
    const liftId = await db.lifts.add({
      name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper',
    } as never)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Dips', type: 'reps' } as never)
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'pending',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    await db.sets.add({
      sessionId, type: 'cross', setNumber: 1, weight: 200, reps: 5, isAmrap: false, liftId,
    })
    await db.accessorySets.add({
      sessionId, exerciseId: exId, setNumber: 1, weight: 20, reps: 10, duration: null, distance: null,
    })
    await db.accessoryNotes.add({ sessionId, exerciseId: exId, notes: 'felt ok' })
    return { liftId, sessionId }
  }

  const orphanCounts = async (sessionId: number) => ({
    sets: (await db.sets.where('sessionId').equals(sessionId).toArray()).length,
    accessorySets: (await db.accessorySets.where('sessionId').equals(sessionId).toArray()).length,
    accessoryNotes: (await db.accessoryNotes.where('sessionId').equals(sessionId).toArray()).length,
  })

  it('archiveLift removes a pending session AND its children (F99)', async () => {
    const { liftId, sessionId } = await liftWithPendingWork()
    await archiveLift(db, liftId)
    expect(await db.sessions.get(sessionId)).toBeFalsy()
    expect(await orphanCounts(sessionId)).toEqual({ sets: 0, accessorySets: 0, accessoryNotes: 0 })
  })

  it('archiveLift leaves a COMPLETED session and its sets alone (F99)', async () => {
    const liftId = await db.lifts.add({
      name: 'Squat', order: 1, progressionIncrement: 10, baseWeight: 135, liftType: 'lower',
    } as never)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })

    await archiveLift(db, liftId)
    // Archiving is reversible and must not touch history.
    expect(await db.sessions.get(sessionId)).toBeTruthy()
    expect((await db.sets.where('sessionId').equals(sessionId).toArray())).toHaveLength(1)
  })

  it('deleteLift removes the lift\'s sessions and their children (F44)', async () => {
    const { liftId, sessionId } = await liftWithPendingWork()
    await deleteLift(db, liftId)
    expect(await db.lifts.get(liftId)).toBeFalsy()
    expect(await db.sessions.get(sessionId)).toBeFalsy()
    expect(await orphanCounts(sessionId)).toEqual({ sets: 0, accessorySets: 0, accessoryNotes: 0 })
  })

  it('deleteLift removes the lift\'s assistanceDefaults (F44)', async () => {
    const liftId = await db.lifts.add({
      name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper',
    } as never)
    const exId = await db.exercises.add({ name: 'Dips', type: 'reps' } as never)
    await db.assistanceDefaults.add({ liftId, section: 'push', exerciseId: exId } as never)

    await deleteLift(db, liftId)
    expect(await db.assistanceDefaults.where('liftId').equals(liftId).toArray()).toHaveLength(0)
  })
})

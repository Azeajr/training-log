import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@solidjs/testing-library'
import Stats from './Stats'
import { db } from '../db/index'

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

const LIFTS = [
  { id: 1, name: 'OHP'   as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { id: 2, name: 'Squat' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

beforeEach(async () => {
  await Promise.all([
    db.lifts.clear(), db.trainingMaxes.clear(),
    db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
  ])
  await db.lifts.bulkAdd(LIFTS)
})

afterEach(drain)

describe('Stats screen', () => {
  it('renders the RECORDS and TRAINING MAX sections', async () => {
    render(() => <Stats />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('RECORDS')
      expect(document.body.textContent).toContain('TRAINING MAX')
    })
  })

  it('shows the best e1RM for a lift with a completed AMRAP set', async () => {
    const t0 = new Date()
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: t0 })
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    // 200 × 5 AMRAP → Wathan 200 / (0.488 + 0.538·e^(−0.375)) = 233.16 → 233
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 200, reps: 5, isAmrap: true })

    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('233'))
  })

  it('uses a stronger non-AMRAP working set for the best e1RM', async () => {
    const t0 = new Date()
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 235, reps: 8, isAmrap: false })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 165, reps: 14, isAmrap: true })

    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('300'))
  })

  it('marks a lift with no completed sets as NO SETS YET and no e1RM row', async () => {
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('NO SETS YET'))
    expect(document.body.textContent).not.toContain('EST. 1RM')
  })

  it('does not count a failed 0-rep AMRAP as a record', async () => {
    const t0 = new Date()
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 200, reps: 0, isAmrap: true })
    render(() => <Stats />)
    // OHP has an AMRAP row but 0 reps → still no record, and no working set either.
    await waitFor(() => expect(document.body.textContent).toContain('NO SETS YET'))
    expect(document.body.textContent).not.toContain('EST. 1RM')
  })

  it('shows the heaviest actual set and its reps, not an estimate', async () => {
    const t0 = new Date()
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'warmup', setNumber: 1, weight: 500, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 200, reps: 5, isAmrap: true })
    await db.sets.add({ sessionId, type: 'joker', setNumber: 1, weight: 225, reps: 2, isAmrap: false })

    render(() => <Stats />)
    // Joker 225x2 is the heaviest real work; the 500 warmup must not win.
    await waitFor(() => expect(document.body.textContent).toContain('225'))
    expect(document.body.textContent).not.toContain('500')
  })

  it('does not count a failed 0-rep set as the actual max', async () => {
    const t0 = new Date()
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 185, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId, type: 'joker', setNumber: 1, weight: 405, reps: 0, isAmrap: false })

    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('185'))
    expect(document.body.textContent).not.toContain('405')
  })

  it('attributes a cross set to the movement lift, not the session lift', async () => {
    const t0 = new Date()
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    // An OHP session carrying a Squat cross block at 315.
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 1, date: t0, notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId, type: 'cross', setNumber: 1, weight: 315, reps: 3, isAmrap: false, liftId: 2 })

    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('315'))
    // Squat (lift 2) owns the 315; OHP (lift 1) tops out at its own 100.
    const rows = document.body.textContent!
    expect(rows).toContain('315')
    expect(rows).toContain('100')
    const ohpIdx = rows.indexOf('OHP')
    const squatIdx = rows.indexOf('Squat')
    expect(rows.slice(ohpIdx, squatIdx)).not.toContain('315')
  })

  it('renders the TM progression chain and the delta from first to current', async () => {
    const base = Date.now()
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date(base) })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date(base + 1000) }) // dupe collapses
    await db.trainingMaxes.add({ liftId: 1, weight: 210, setAt: new Date(base + 2000) })

    render(() => <Stats />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('210') // current
      expect(document.body.textContent).toContain('+10') // delta from 200
    })
  })

  it('shows a downward TM change (deload/reset) as a negative delta', async () => {
    const base = Date.now()
    await db.trainingMaxes.add({ liftId: 1, weight: 220, setAt: new Date(base) })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date(base + 1000) })
    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('-20'))
  })
})

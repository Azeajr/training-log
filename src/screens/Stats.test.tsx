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

  it('shows the best Epley e1RM for a lift with a completed AMRAP set', async () => {
    const t0 = new Date()
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: t0 })
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    // 200 × 5 AMRAP → Epley 200 * (1 + 5/30) = 233.33 → 233
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 200, reps: 5, isAmrap: true })

    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('233'))
  })

  it('marks a lift with no completed AMRAP as NO AMRAP YET', async () => {
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    render(() => <Stats />)
    await waitFor(() => expect(document.body.textContent).toContain('NO AMRAP YET'))
  })

  it('does not count a failed 0-rep AMRAP as a record', async () => {
    const t0 = new Date()
    const cycleId = await db.cycles.add({ number: 1, startDate: t0, endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 3, date: t0, notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 200, reps: 0, isAmrap: true })
    render(() => <Stats />)
    // OHP has an AMRAP row but 0 reps → still no record.
    await waitFor(() => expect(document.body.textContent).toContain('NO AMRAP YET'))
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

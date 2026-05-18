import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import History from './History'
import { db } from '../db/index'

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

function renderHistory() {
  return render(() => (
    <Router>
      <Route path="*" component={History} />
    </Router>
  ))
}

async function seedLift() {
  return db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
}

async function seedTm(liftId: number, weight: number, msAgo: number) {
  return db.trainingMaxes.add({ liftId, weight, setAt: new Date(Date.now() - msAgo) })
}

async function seedSession(
  liftId: number,
  cycleId: number,
  msAgo: number,
  amrap?: { weight: number; reps: number },
) {
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1,
    date: new Date(Date.now() - msAgo),
    notes: null, status: 'completed',
  })
  if (amrap) {
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: amrap.weight, reps: amrap.reps, isAmrap: true })
  }
  return sessionId
}

describe('History — estimated 1RM chart', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(),
      db.trainingMaxes.clear(),
      db.cycles.clear(),
      db.sessions.clear(),
      db.sets.clear(),
    ])
  })

  afterEach(drain)

  it('shows TM legend when lift has 2+ training maxes', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    await seedTm(liftId, 210, 1_000_000)

    renderHistory()

    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
  })

  it('hides TM legend when lift has fewer than 2 training maxes', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 1_000_000)

    renderHistory()
    await screen.findByText('Bench') // lift loaded
    expect(screen.queryByText('— TM')).not.toBeInTheDocument()
  })

  it('shows est. 1RM legend when 2+ sessions have AMRAP sets', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    await seedTm(liftId, 210, 1_000_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 2_000_000, { weight: 185, reps: 5 })
    await seedSession(liftId, cycleId, 1_000_000, { weight: 190, reps: 6 })

    renderHistory()

    await waitFor(() => expect(screen.getByText('- - est. 1RM')).toBeInTheDocument())
  })

  it('hides est. 1RM legend when no sessions have AMRAP sets', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 1_000_000) // no AMRAP

    renderHistory()
    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
    expect(screen.queryByText('- - est. 1RM')).not.toBeInTheDocument()
  })

  it('hides est. 1RM legend when only 1 session has AMRAP data', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 1_000_000, { weight: 185, reps: 5 })

    renderHistory()
    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
    expect(screen.queryByText('- - est. 1RM')).not.toBeInTheDocument()
  })
})

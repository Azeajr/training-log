import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../src/db/db'
import type { Lift } from '../../src/db/db'
import { clearSession, startSession } from '../store/workoutStore'
import Today from './Today'

const SEED_LIFTS: Omit<Lift, 'id'>[] = [
  { name: 'OHP',   order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
  { name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
]

beforeEach(async () => {
  clearSession()
  await db.delete()
  await db.open()
  await db.lifts.bulkAdd(SEED_LIFTS)
  await db.trainingMaxes.bulkAdd([
    { liftId: 1, weight: 100, setAt: new Date() },
    { liftId: 2, weight: 200, setAt: new Date() },
  ])
})

describe('Today', () => {
  it('shows lift buttons after data loads', async () => {
    render(() => <Router><Route path="*" component={Today} /></Router>)
    expect(await screen.findByRole('button', { name: /OHP/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Squat/i })).toBeInTheDocument()
  })

  it('shows week label', async () => {
    render(() => <Router><Route path="*" component={Today} /></Router>)
    expect(await screen.findByText(/WEEK/i)).toBeInTheDocument()
  })

  it('shows START WORKOUT button when lift is selected', async () => {
    render(() => <Router><Route path="*" component={Today} /></Router>)
    expect(await screen.findByRole('button', { name: /START WORKOUT/i })).toBeInTheDocument()
  })

  it('shows SESSION IN PROGRESS banner when workout is active', async () => {
    startSession({ id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    render(() => <Router><Route path="*" component={Today} /></Router>)
    expect(await screen.findByText(/SESSION IN PROGRESS/i)).toBeInTheDocument()
  })

  it('abandon confirm appears when START WORKOUT clicked while a different lift session is active', async () => {
    // active session is for OHP (liftId=1); user selects Squat then clicks start
    startSession({ id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    render(() => <Router><Route path="*" component={Today} /></Router>)
    // click Squat to change selected lift
    const squatBtn = await screen.findByRole('button', { name: /Squat/i })
    fireEvent.click(squatBtn)
    // click START WORKOUT — OHP is active but Squat is selected
    const startBtn = screen.getByRole('button', { name: /START WORKOUT/i })
    fireEvent.click(startBtn)
    expect(await screen.findByText(/ABANDON SESSION\?/i)).toBeInTheDocument()
  })

  it('CANCEL closes the abandon confirm modal', async () => {
    startSession({ id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    render(() => <Router><Route path="*" component={Today} /></Router>)
    const squatBtn = await screen.findByRole('button', { name: /Squat/i })
    fireEvent.click(squatBtn)
    fireEvent.click(screen.getByRole('button', { name: /START WORKOUT/i }))
    await screen.findByText(/ABANDON SESSION\?/i)
    fireEvent.click(screen.getByRole('button', { name: /^CANCEL$/i }))
    await waitFor(() => {
      expect(screen.queryByText(/ABANDON SESSION\?/i)).toBeNull()
    })
  })

  it('START WORKOUT creates a session in DB when no active session exists', async () => {
    render(() => <Router><Route path="*" component={Today} /></Router>)
    const startBtn = await screen.findByRole('button', { name: /START WORKOUT/i })
    fireEvent.click(startBtn)
    await waitFor(async () => {
      expect(await db.sessions.count()).toBe(1)
    })
  })

  it('week 4 shows DELOAD label when all prior weeks completed', async () => {
    // seed 4 lifts + TMs + cycle with weeks 1-3 done so getNextSession returns week 4
    await db.delete()
    await db.open()
    await db.lifts.bulkAdd([
      { name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
      { name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
    ])
    const lifts = await db.lifts.toArray()
    for (const l of lifts) {
      await db.trainingMaxes.add({ liftId: l.id!, weight: 150, setAt: new Date() })
    }
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (const week of [1, 2, 3] as const) {
      for (const l of lifts) {
        await db.sessions.add({ cycleId, liftId: l.id!, week, date: new Date(), notes: null, status: 'completed' })
      }
    }
    render(() => <Router><Route path="*" component={Today} /></Router>)
    expect(await screen.findByText(/DELOAD/i)).toBeInTheDocument()
  })
})

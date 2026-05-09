import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
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
})

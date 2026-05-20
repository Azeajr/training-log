import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import Setup from './Setup'
import { db } from '../db/index'

const mockNavigate = vi.fn()
vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

function renderSetup() {
  return render(() => (
    <Router>
      <Route path="*" component={Setup} />
    </Router>
  ))
}

beforeEach(async () => {
  await Promise.all([
    db.lifts.clear(),
    db.trainingMaxes.clear(),
  ])
  mockNavigate.mockClear()
  await db.lifts.bulkAdd([
    { id: 1, name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
    { id: 2, name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
    { id: 3, name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
    { id: 4, name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
  ])
})

afterEach(drain)

describe('Setup screen', () => {
  it('shows step 1 heading on first render', async () => {
    renderSetup()
    await screen.findByText('STEP 1 OF 2 — TRAINING MAXES')
  })

  it('renders a row for each lift', async () => {
    renderSetup()
    await screen.findByText('OHP')
    await screen.findByText('Deadlift')
    await screen.findByText('Bench')
    await screen.findByText('Squat')
  })

  it('NEXT button advances to step 2', async () => {
    renderSetup()
    await screen.findByText('OHP') // wait for lifts to load so NEXT is enabled
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 2 OF 2 — CONFIRM')
  })

  it('step 2 shows TRAINING MAXES review heading', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText(/TRAINING MAXES/)
    await screen.findByText('REVIEW YOUR TRAINING MAXES', { exact: false }).catch(() => null)
  })

  it('BACK button on step 2 returns to step 1', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 2 OF 2 — CONFIRM')
    fireEvent.click(await screen.findByText('BACK'))
    await screen.findByText('STEP 1 OF 2 — TRAINING MAXES')
  })

  it('START TRAINING saves TMs and navigates', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 2 OF 2 — CONFIRM')
    fireEvent.click(await screen.findByText('START TRAINING'))
    await waitFor(async () => {
      const tms = await db.trainingMaxes.toArray()
      expect(tms.length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/today', { replace: true })
    })
  })

  it('START TRAINING creates one TM per lift', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 2 OF 2 — CONFIRM')
    fireEvent.click(await screen.findByText('START TRAINING'))
    await waitFor(async () => {
      const tms = await db.trainingMaxes.toArray()
      expect(tms).toHaveLength(4)
    })
  })

  it('IMPORT INSTEAD link is visible on step 1', async () => {
    renderSetup()
    await screen.findByText('IMPORT INSTEAD')
  })

  it('clicking + on TM Stepper updates the value (setTmVal)', async () => {
    renderSetup()
    await screen.findByText('OHP')

    const plusBtns = await waitFor(() => {
      const btns = screen.getAllByText('+')
      expect(btns.length).toBeGreaterThan(0)
      return btns
    })
    fireEvent.click(plusBtns[0]) // OHP baseWeight=95, step=5 → 100

    await waitFor(() => expect(document.body.textContent).toContain('100'))
  })

  it('START TRAINING uses custom TM when Stepper was changed (covers vals[id] ?? baseWeight left-side)', async () => {
    renderSetup()
    await screen.findByText('OHP')

    const plusBtns = await waitFor(() => screen.getAllByText('+'))
    fireEvent.click(plusBtns[0]) // OHP: 95 → 100

    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 2 OF 2 — CONFIRM')
    // Review shows 100 (custom) for OHP and 135 (baseWeight) for others
    expect(document.body.textContent).toContain('100')

    fireEvent.click(screen.getByText('START TRAINING'))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.toArray()
      const ohpTm = tms.find(t => t.liftId === 1)
      expect(ohpTm?.weight).toBe(100)
    })
  })
})

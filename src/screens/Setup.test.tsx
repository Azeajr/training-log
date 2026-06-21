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
    db.liftAccessories.clear(),
    db.liftSupplementals.clear(),
    db.exercises.clear(),
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

// Advance from step 1 (MAIN LIFTS) to step 2 (TRAINING MAXES).
async function gotoTmStep() {
  await screen.findByText('OHP')
  fireEvent.click(screen.getByText('NEXT'))
  await screen.findByText('STEP 2 OF 3 — TRAINING MAXES')
}

describe('Setup screen — flow', () => {
  it('opens on the MAIN LIFTS step', async () => {
    renderSetup()
    await screen.findByText('STEP 1 OF 3 — MAIN LIFTS')
  })

  it('lists the seeded default lifts', async () => {
    renderSetup()
    await screen.findByText('OHP')
    await screen.findByText('Deadlift')
    await screen.findByText('Bench')
    await screen.findByText('Squat')
  })

  it('IMPORT INSTEAD link is visible on step 1', async () => {
    renderSetup()
    await screen.findByText('IMPORT INSTEAD')
  })

  it('NEXT advances to the TRAINING MAXES step', async () => {
    renderSetup()
    await gotoTmStep()
  })

  it('NEXT on TRAINING MAXES advances to CONFIRM', async () => {
    renderSetup()
    await gotoTmStep()
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 3 OF 3 — CONFIRM')
  })

  it('BACK from CONFIRM returns to TRAINING MAXES', async () => {
    renderSetup()
    await gotoTmStep()
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 3 OF 3 — CONFIRM')
    fireEvent.click(screen.getByText('BACK'))
    await screen.findByText('STEP 2 OF 3 — TRAINING MAXES')
  })

  it('BACK from TRAINING MAXES returns to MAIN LIFTS', async () => {
    renderSetup()
    await gotoTmStep()
    fireEvent.click(screen.getByText('BACK'))
    await screen.findByText('STEP 1 OF 3 — MAIN LIFTS')
  })

  it('START TRAINING creates one TM per lift and navigates', async () => {
    renderSetup()
    await gotoTmStep()
    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 3 OF 3 — CONFIRM')
    fireEvent.click(await screen.findByText('START TRAINING'))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.toArray()
      expect(tms).toHaveLength(4)
    })
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today', { replace: true }))
  })

  it('clicking + on a TM Stepper updates the value and carries to confirm', async () => {
    renderSetup()
    await gotoTmStep()

    const plusBtns = await waitFor(() => {
      const btns = screen.getAllByText('+')
      expect(btns.length).toBeGreaterThan(0)
      return btns
    })
    fireEvent.click(plusBtns[0]) // OHP baseWeight=95, step=5 → 100
    await waitFor(() => expect(document.body.textContent).toContain('100'))

    fireEvent.click(screen.getByText('NEXT'))
    await screen.findByText('STEP 3 OF 3 — CONFIRM')
    fireEvent.click(screen.getByText('START TRAINING'))
    await waitFor(async () => {
      const ohpTm = (await db.trainingMaxes.toArray()).find(t => t.liftId === 1)
      expect(ohpTm?.weight).toBe(100)
    })
  })
})

describe('Setup screen — roster editing', () => {
  it('renaming a lift updates it in the DB', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getAllByText('rename')[0])

    const input = await waitFor(() => screen.getByDisplayValue('OHP'))
    fireEvent.input(input, { target: { value: 'Push Press' } })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const lift = await db.lifts.get(1)
      expect(lift?.name).toBe('Push Press')
    })
  })

  it('removing a lift deletes it from the DB', async () => {
    renderSetup()
    await screen.findByText('Squat')
    const removeBtns = await screen.findAllByText('remove')
    fireEvent.click(removeBtns[removeBtns.length - 1]) // last lift = Squat

    await waitFor(async () => {
      const lifts = await db.lifts.toArray()
      expect(lifts).toHaveLength(3)
      expect(lifts.some(l => l.name === 'Squat')).toBe(false)
    })
  })

  it('reordering swaps the order of adjacent lifts', async () => {
    renderSetup()
    await screen.findByText('OHP')
    const downBtns = await screen.findAllByLabelText('Move down')
    fireEvent.click(downBtns[0]) // move OHP (order 1) down past Deadlift (order 2)

    await waitFor(async () => {
      const ohp = await db.lifts.get(1)
      const dl = await db.lifts.get(2)
      expect(ohp?.order).toBe(2)
      expect(dl?.order).toBe(1)
    })
  })

  it('adding a lift opens setup on a draft and persists it only on DONE', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getByText('+ ADD LIFT'))

    const nameInput = await screen.findByPlaceholderText('Lift name')
    fireEvent.input(nameInput, { target: { value: 'Front Squat' } })
    fireEvent.click(screen.getByText('ADD'))

    // Setup modal opens against the draft, but nothing is written yet.
    await screen.findByText('DONE')
    expect(document.body.textContent).toContain('ASSISTANCE')
    expect((await db.lifts.toArray()).some(l => l.name === 'Front Squat')).toBe(false)

    // Commit creates the lift.
    fireEvent.click(screen.getByText('DONE'))
    await waitFor(async () => {
      expect((await db.lifts.toArray()).some(l => l.name === 'Front Squat')).toBe(true)
    })
    await waitFor(() => expect(screen.queryByText('DONE')).not.toBeInTheDocument())
  })

  it('cancelling new-lift setup discards it and restores the add form', async () => {
    renderSetup()
    await screen.findByText('OHP')
    fireEvent.click(screen.getByText('+ ADD LIFT'))

    const nameInput = await screen.findByPlaceholderText('Lift name')
    fireEvent.input(nameInput, { target: { value: 'Front Squat' } })
    fireEvent.click(screen.getByText('ADD'))

    await screen.findByText('DONE')
    fireEvent.click(screen.getByText('CANCEL'))

    // No lift created...
    await waitFor(() => expect(screen.queryByText('DONE')).not.toBeInTheDocument())
    expect((await db.lifts.toArray()).some(l => l.name === 'Front Squat')).toBe(false)
    // ...and the add form is back with the entered name still populated.
    const restored = await screen.findByPlaceholderText('Lift name') as HTMLInputElement
    expect(restored.value).toBe('Front Squat')
  })
})

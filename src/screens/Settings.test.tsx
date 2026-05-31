import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import Settings from './Settings'
import { ConfirmationContext, createConfirmation } from '../hooks/use-confirmation'
import ConfirmationDialog from '../components/modals/ConfirmationDialog'
import { db } from '../db/index'
import { DEFAULT_PLATES, loadSettings } from '../store/settings-store'
import { toast } from '../store/toast-store'

function renderSettings() {
  const api = createConfirmation()
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Settings />
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

async function seedLifts() {
  return Promise.all([
    db.lifts.add({ name: 'Squat',    order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'lower' }),
    db.lifts.add({ name: 'Bench',    order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' }),
    db.lifts.add({ name: 'Deadlift', order: 2, progressionIncrement: 5, baseWeight: 45, liftType: 'lower' }),
    db.lifts.add({ name: 'OHP',      order: 3, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' }),
  ])
}

describe('Settings — CLEANUP ORPHANS', () => {
  beforeEach(async () => {
    await Promise.all([
      db.exercises.clear(),
      db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(),
      db.accessorySets.clear(),
      db.sessions.clear(),
      db.lifts.clear(),
      db.cycles.clear(),
    ])
  })

  afterEach(drain)

  it('cancel does not modify DB', async () => {
    await db.exercises.add({ name: 'Curl', type: 'reps' })
    await db.liftAccessories.add({ liftId: 1, exerciseId: 9999, order: 0 })

    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CANCEL'))

    const las = await db.liftAccessories.toArray()
    expect(las).toHaveLength(1)
  })

  it('removes orphan liftAccessory rows', async () => {
    await db.exercises.add({ name: 'Curl', type: 'reps' })
    const exId2 = await db.exercises.add({ name: 'Row', type: 'reps' })
    await db.liftAccessories.add({ liftId: 1, exerciseId: 9999, order: 0 })
    await db.liftAccessories.add({ liftId: 1, exerciseId: exId2, order: 1 })

    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CLEANUP'))

    await waitFor(async () => {
      const las = await db.liftAccessories.toArray()
      expect(las).toHaveLength(1)
      expect(las[0].exerciseId).toBe(exId2)
    })
  })

  it('archives exercise with no assignments and no set history', async () => {
    const orphanId = await db.exercises.add({ name: 'Forgotten', type: 'reps' })
    const activeId = await db.exercises.add({ name: 'Active', type: 'reps' })
    await db.liftAccessories.add({ liftId: 1, exerciseId: activeId, order: 0 })

    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CLEANUP'))

    await waitFor(async () => {
      const orphan = await db.exercises.get(orphanId)
      expect(orphan?.archived).toBe(true)
    })
    const active = await db.exercises.get(activeId)
    expect(active?.archived).toBeFalsy()
  })

  it('removes orphan accessoryTrainingMax rows during cleanup', async () => {
    await db.accessoryTrainingMaxes.add({ exerciseId: 9999, weight: 50, incrementLb: 5, setAt: new Date() })

    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CLEANUP'))

    await waitFor(async () => {
      const atms = await db.accessoryTrainingMaxes.toArray()
      expect(atms).toHaveLength(0)
    })
  })

  it('shows "No orphan data found" toast when DB is already clean', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CLEANUP'))
    await waitFor(() => {
      expect(toast()).toBe('No orphan data found')
    })
  })

  it('does not archive exercise that has set history', async () => {
    const exId = await db.exercises.add({ name: 'Curl', type: 'reps' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 10, duration: null, distance: null })

    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CLEANUP'))

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.archived).toBeFalsy()
    })
  })
})

describe('Settings — skip to week', () => {
  beforeEach(async () => {
    await Promise.all([
      db.exercises.clear(),
      db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(),
      db.accessorySets.clear(),
      db.sessions.clear(),
      db.lifts.clear(),
      db.cycles.clear(),
    ])
  })

  afterEach(drain)

  it('hides CYCLE section when no cycle exists', async () => {
    renderSettings()
    await drain()
    expect(screen.queryByRole('button', { name: 'Week 2' })).not.toBeInTheDocument()
  })

  it('disables current week button, enables future weeks', async () => {
    await seedLifts()
    await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })

    renderSettings()

    const btn1 = await screen.findByRole('button', { name: 'Week 1' })
    const btn2 = screen.getByRole('button', { name: 'Week 2' })
    expect(btn1).toBeDisabled()
    expect(btn2).not.toBeDisabled()
  })

  it('cancel does not create sessions', async () => {
    await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })

    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Week 2' }))
    fireEvent.click(await screen.findByText('CANCEL'))

    const sessions = await db.sessions.where('cycleId').equals(cycleId).toArray()
    expect(sessions).toHaveLength(0)
  })

  it('skip to week 2 creates 4 skipped sessions for week 1', async () => {
    await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })

    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Week 2' }))
    fireEvent.click(await screen.findByText('SKIP'))

    await waitFor(async () => {
      const sessions = await db.sessions.where('cycleId').equals(cycleId).toArray()
      expect(sessions).toHaveLength(4)
      expect(sessions.every(s => s.status === 'skipped' && s.week === 1)).toBe(true)
    })
  })

  it('skip marks existing pending session as skipped', async () => {
    const [liftId] = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'pending' })

    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Week 2' }))
    fireEvent.click(await screen.findByText('SKIP'))

    await waitFor(async () => {
      const s = await db.sessions.get(sessionId)
      expect(s?.status).toBe('skipped')
    })
  })

  it('skip does not alter already-completed session', async () => {
    const [liftId] = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed' })

    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Week 2' }))
    fireEvent.click(await screen.findByText('SKIP'))

    await waitFor(async () => {
      const sessions = await db.sessions.where('cycleId').equals(cycleId).toArray()
      expect(sessions.length).toBeGreaterThan(0)
    })
    const completed = await db.sessions.get(sessionId)
    expect(completed?.status).toBe('completed')
  })

  it('skip multiple weeks creates sessions for each skipped week', async () => {
    await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })

    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Week 3' }))
    fireEvent.click(await screen.findByText('SKIP'))

    await waitFor(async () => {
      const sessions = await db.sessions.where('cycleId').equals(cycleId).toArray()
      const week1 = sessions.filter(s => s.week === 1)
      const week2 = sessions.filter(s => s.week === 2)
      expect(week1).toHaveLength(4)
      expect(week2).toHaveLength(4)
      expect(sessions.every(s => s.status === 'skipped')).toBe(true)
    })
  })
})

// ─── Settings — deload ────────────────────────────────────────────────────────

describe('Settings — deload', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
  })

  afterEach(drain)

  it('DELOAD confirmed drops all TMs by 10% (new TM records added)', async () => {
    const liftId1 = await db.lifts.add({ name: 'OHP',   order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const liftId2 = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: liftId1, weight: 200, setAt: new Date('2026-01-01') })
    await db.trainingMaxes.add({ liftId: liftId2, weight: 300, setAt: new Date('2026-01-01') })

    renderSettings()

    fireEvent.click(await screen.findByText(/DELOAD ALL/))
    fireEvent.click(await screen.findByText('DELOAD'))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.orderBy('setAt').toArray()
      const ohpLatest  = tms.filter(t => t.liftId === liftId1).at(-1)
      const benchLatest = tms.filter(t => t.liftId === liftId2).at(-1)
      expect(ohpLatest?.weight).toBe(180)  // 200 × 0.9
      expect(benchLatest?.weight).toBe(270) // 300 × 0.9
    })
  })

  it('DELOAD cancelled does not change TMs', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date('2026-01-01') })

    renderSettings()

    fireEvent.click(await screen.findByText(/DELOAD ALL/))
    fireEvent.click(await screen.findByText('CANCEL'))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.toArray()
      expect(tms).toHaveLength(1)
      expect(tms[0].weight).toBe(200)
    })
  })
})

// ─── Settings — training max editing ─────────────────────────────────────────

describe('Settings — TM editing', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
  })

  afterEach(drain)

  it('clicking edit shows Stepper for TM input', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })

    renderSettings()
    // Wait for TM to load — "200 lb" only appears after tms() is populated
    await waitFor(() => expect(document.body.textContent).toContain('200 lb'))

    fireEvent.click(screen.getByText('edit'))

    // Stepper appears showing 200 (current TM)
    await waitFor(() => expect(screen.getByText('200')).toBeInTheDocument())
    expect(screen.getByText('cancel')).toBeInTheDocument()
  })

  it('TM edit + Stepper + SAVE creates new TM record in DB', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date('2026-01-01') })

    renderSettings()
    await waitFor(() => expect(document.body.textContent).toContain('200 lb'))

    fireEvent.click(screen.getByText('edit'))

    // Click + on the TM stepper (step=5, value=200 → 205)
    await waitFor(() => screen.getByText('200'))
    const plusBtns = screen.getAllByText('+')
    fireEvent.click(plusBtns[0])

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
      expect(tms.at(-1)?.weight).toBe(205)
    })
  })

  it('TM edit cancel hides Stepper without DB change', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date() })

    renderSettings()
    await waitFor(() => expect(document.body.textContent).toContain('200 lb'))
    fireEvent.click(screen.getByText('edit'))
    await screen.findByText('cancel')

    fireEvent.click(screen.getByText('cancel'))

    await waitFor(() => {
      expect(screen.queryByText('cancel')).not.toBeInTheDocument()
    })
    const tms = await db.trainingMaxes.toArray()
    expect(tms).toHaveLength(1)
  })

  it('SAVE TM with value 0 does nothing (guard branch)', async () => {
    await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    // No TM seeded → tmInput defaults to 0 via ?. ?? 0

    renderSettings()
    await waitFor(() => expect(document.body.textContent).toContain('OHP'))

    // click edit; tmInput = tms()[id] ?? 0 = undefined ?? 0 = 0
    fireEvent.click(screen.getAllByText('edit')[0])
    await screen.findByText('cancel')

    fireEvent.click(screen.getByText('SAVE')) // hits if (tmInput() <= 0) return

    // edit mode still open (setEditingTm(null) was NOT called)
    expect(screen.queryByText('cancel')).toBeInTheDocument()
    const tms = await db.trainingMaxes.toArray()
    expect(tms).toHaveLength(0)
  })
})

// ─── Settings — exercises ─────────────────────────────────────────────────────

describe('Settings — exercises', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
  })

  afterEach(drain)

  it('+ ADD EXERCISE shows form with name input', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('+ ADD EXERCISE'))

    expect(screen.getByPlaceholderText('Exercise name')).toBeInTheDocument()
    expect(screen.getByText('ADD')).toBeInTheDocument()
  })

  it('adding a named exercise creates it in DB', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('+ ADD EXERCISE'))

    const nameInput = screen.getByPlaceholderText('Exercise name') as HTMLInputElement
    nameInput.value = 'Pull-up'
    fireEvent.input(nameInput, { target: { value: 'Pull-up' } })

    fireEvent.click(screen.getByText('ADD'))

    await waitFor(async () => {
      const exercises = await db.exercises.toArray()
      expect(exercises.some(e => e.name === 'Pull-up')).toBe(true)
    })
  })

  it('add exercise with empty name does nothing', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('+ ADD EXERCISE'))

    // Click ADD without filling name
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(async () => {
      const exercises = await db.exercises.toArray()
      expect(exercises).toHaveLength(0)
    })
  })

  it('archive exercise (confirmed) marks it archived in DB', async () => {
    const exId = await db.exercises.add({ name: 'Dip', type: 'reps' })
    renderSettings()

    await screen.findByText('Dip')
    fireEvent.click(screen.getByText('archive'))

    await screen.findByText('Archive this exercise?')
    fireEvent.click(screen.getByText('ARCHIVE'))

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.archived).toBe(true)
    })
  })

  it('archive exercise cancelled does not archive', async () => {
    const exId = await db.exercises.add({ name: 'Dip', type: 'reps' })
    renderSettings()

    await screen.findByText('Dip')
    fireEvent.click(screen.getByText('archive'))

    await screen.findByText('Archive this exercise?')
    fireEvent.click(screen.getByText('CANCEL'))

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.archived).toBeFalsy()
    })
  })

  it('unarchive exercise marks it active again', async () => {
    const exId = await db.exercises.add({ name: 'Dip', type: 'reps', archived: true })
    renderSettings()

    await waitFor(() => expect(document.body.textContent).toContain('ARCHIVED'))
    fireEvent.click(await screen.findByText('unarchive'))

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.archived).toBe(false)
    })
  })

  it('renaming an exercise updates name in DB', async () => {
    const exId = await db.exercises.add({ name: 'Old Name', type: 'reps' })
    renderSettings()

    await screen.findByText('Old Name')
    fireEvent.click(screen.getByText('edit'))

    // Input appears with current name as value
    await waitFor(() => screen.getByDisplayValue('Old Name'))
    const input = screen.getByDisplayValue('Old Name') as HTMLInputElement
    input.value = 'New Name'
    fireEvent.input(input, { target: { value: 'New Name' } })

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.name).toBe('New Name')
    })
  })

  it('clicking SAVE with empty exercise name does nothing', async () => {
    const exId = await db.exercises.add({ name: 'Dip', type: 'reps' })
    renderSettings()

    await screen.findByText('Dip')
    const editBtns = await screen.findAllByText('edit')
    fireEvent.click(editBtns[0])

    await waitFor(() => screen.getByDisplayValue('Dip'))
    const input = screen.getByDisplayValue('Dip') as HTMLInputElement
    fireEvent.input(input, { target: { value: '' } })

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.name).toBe('Dip')
    })
  })

  it('+ assign shows dropdown and cancel hides it', async () => {
    await seedLifts()
    await db.exercises.add({ name: 'Chinup', type: 'reps' })
    renderSettings()

    // Multiple lifts each show a + assign button (one per lift with available exercises)
    const assignBtns = await screen.findAllByText('+ assign')
    fireEvent.click(assignBtns[0]) // click first lift's + assign

    // Dropdown appears
    await waitFor(() => expect(screen.getByText('pick exercise')).toBeInTheDocument())

    // Cancel hides it
    fireEvent.click(screen.getByText('cancel'))
    await waitFor(() => expect(screen.queryByText('pick exercise')).not.toBeInTheDocument())
  })

  it('+ assign → select exercise → ADD assigns exercise to lift', async () => {
    await seedLifts()
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    renderSettings()

    const assignBtns = await screen.findAllByText('+ assign')
    fireEvent.click(assignBtns[0])
    await waitFor(() => expect(screen.getByText('pick exercise')).toBeInTheDocument())

    // Select Chinup from dropdown
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: String(exId) } })

    // Click ADD (enabled after selection)
    const addBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.trim() === 'ADD' && !b.hasAttribute('disabled'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(addBtn)

    await waitFor(async () => {
      const las = await db.liftAccessories.toArray()
      expect(las.some(la => la.exerciseId === exId)).toBe(true)
    })
  })

  it('renaming exercise with changed increment updates ATM increment in DB', async () => {
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const tmId = await db.accessoryTrainingMaxes.add({ exerciseId: exId, weight: 50, incrementLb: 2.5, setAt: new Date() })

    renderSettings()
    await screen.findByText('Chinup')

    const editBtns = await screen.findAllByText('edit')
    fireEvent.click(editBtns[0]) // "ALL EXERCISES" edit button

    await waitFor(() => expect(document.body.textContent).toContain('Increment'))

    // Click + in the Increment stepper row to change 2.5 → 5
    const incLabel = screen.getByText('Increment')
    const incRow = incLabel.closest('div')!
    const plusBtn = Array.from(incRow.querySelectorAll('button')).find(b => b.textContent?.trim() === '+')!
    fireEvent.click(plusBtn)

    fireEvent.click(screen.getByText('SAVE'))

    // editExIncrement starts at 5 (default, set before accessoryIncrements loads)
    // after one + click (step=2.5): 7.5 ≠ 2.5 → line 96 fires
    await waitFor(async () => {
      const atm = await db.accessoryTrainingMaxes.get(tmId)
      expect(atm?.incrementLb).toBe(7.5)
    })
  })

  it('lift with 2+ accessories triggers sort comparator', async () => {
    const [liftId] = await seedLifts()
    const exId1 = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const exId2 = await db.exercises.add({ name: 'Dip',    type: 'reps' })
    await db.liftAccessories.add({ liftId, exerciseId: exId1, order: 1 })
    await db.liftAccessories.add({ liftId, exerciseId: exId2, order: 0 })

    renderSettings()

    // Both exercises render — sort callback was invoked
    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toContain('Chinup')
      expect(text).toContain('Dip')
    })
  })

  it('pressing Enter in ALL EXERCISES rename input saves the exercise name', async () => {
    const exId = await db.exercises.add({ name: 'OldName', type: 'reps' })
    renderSettings()
    await screen.findByText('OldName')

    fireEvent.click(screen.getByText('edit'))
    const input = await waitFor(() => screen.getByDisplayValue('OldName'))
    fireEvent.input(input, { target: { value: 'NewName' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.name).toBe('NewName')
    })
  })

  it('pressing Escape in ALL EXERCISES rename input cancels editing', async () => {
    const exId = await db.exercises.add({ name: 'OldName', type: 'reps' })
    renderSettings()
    await screen.findByText('OldName')

    fireEvent.click(screen.getByText('edit'))
    const input = await waitFor(() => screen.getByDisplayValue('OldName'))
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('SAVE')).not.toBeInTheDocument())
    const ex = await db.exercises.get(exId)
    expect(ex?.name).toBe('OldName')
  })

  it('pressing Enter in per-lift rename input saves the exercise name', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    renderSettings()

    // wait for per-lift section (del button only appears there)
    await screen.findByText('del')
    const editBtns = screen.getAllByText('edit')
    // [0] = TM edit, [1] = per-lift edit, [2] = ALL EXERCISES edit
    fireEvent.click(editBtns[1])

    // both per-lift and ALL EXERCISES sections show the same input (shared editExName())
    const inputs = await waitFor(() => screen.getAllByDisplayValue('Chinup'))
    fireEvent.input(inputs[0], { target: { value: 'Pull-up' } })
    fireEvent.keyDown(inputs[0], { key: 'Enter' })

    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex?.name).toBe('Pull-up')
    })
  })

  it('pressing Escape in per-lift rename input cancels editing', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    renderSettings()

    await screen.findByText('del')
    const editBtns = screen.getAllByText('edit')
    fireEvent.click(editBtns[1]) // per-lift edit

    const inputs = await waitFor(() => screen.getAllByDisplayValue('Chinup'))
    fireEvent.keyDown(inputs[0], { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('SAVE')).not.toBeInTheDocument())
    const ex = await db.exercises.get(exId)
    expect(ex?.name).toBe('Chinup')
  })

  it('ADD button without exercise selection does nothing', async () => {
    await seedLifts()
    await db.exercises.add({ name: 'Chinup', type: 'reps' })
    renderSettings()

    const assignBtns = await screen.findAllByText('+ assign')
    fireEvent.click(assignBtns[0])
    await waitFor(() => expect(screen.getByText('pick exercise')).toBeInTheDocument())

    // Click ADD without selecting — addToLiftExId() is null → if (id) false
    const addBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      return btns.find(b => b.textContent?.trim() === 'ADD')!
    })
    // SolidJS checks node.disabled before calling onClick; clear it to force handler execution
    ;(addBtn as HTMLButtonElement).disabled = false
    fireEvent.click(addBtn)

    const las = await db.liftAccessories.toArray()
    expect(las).toHaveLength(0)
  })

  it('selecting empty option in assign dropdown sets addToLiftExId to null', async () => {
    await seedLifts()
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    renderSettings()

    const assignBtns = await screen.findAllByText('+ assign')
    fireEvent.click(assignBtns[0])

    const select = await waitFor(() => screen.getByRole('combobox'))
    // Select a real exercise first
    fireEvent.change(select, { target: { value: String(exId) } })
    // Then revert to empty → Number('') || null = null → branch 1
    fireEvent.change(select, { target: { value: '' } })

    // ADD button still disabled (no selection), no crash
    await waitFor(() => expect(screen.getByText('pick exercise')).toBeInTheDocument())
  })

  it('del button removes exercise from lift', async () => {
    const [liftId] = await seedLifts()
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const laId = await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    renderSettings()

    // Wait for 'del' button to appear in the per-lift assignment section
    await screen.findByText('del')
    fireEvent.click(screen.getByText('del'))

    await waitFor(async () => {
      const la = await db.liftAccessories.get(laId)
      expect(la).toBeUndefined()
    })
  })
})

// ─── Settings — rest timers ───────────────────────────────────────────────────

describe('Settings — rest timers', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
    // Seed a settings row so updateSettings can write to DB
    await db.settings.clear()
    await db.settings.add({
      restTimer1: 90, restTimer2: 180, restTimerFail: 300,
      theme: 'dark', barWeight: 45, plates: DEFAULT_PLATES,
    })
    // Sync the reactive store with the seeded DB values
    await loadSettings()
  })

  afterEach(drain)

  it('timer + button increases restTimer1 by 30 s', async () => {
    renderSettings()

    // Wait for timer display "1:30" (90 s)
    await screen.findByText('1:30')

    // Find the + button in the First timer row
    const timeEl = screen.getByText('1:30')
    const row = timeEl.closest('div')!
    const buttons = Array.from(row.querySelectorAll('button'))
    const plusBtn = buttons.find(b => b.textContent?.trim() === '+')!
    fireEvent.click(plusBtn)

    await waitFor(async () => {
      const s = await db.settings.toCollection().first()
      expect(s?.restTimer1).toBe(120) // 90 + 30
    })
  })

  it('timer - button decreases restTimer1 by 30 s', async () => {
    renderSettings()
    await screen.findByText('1:30')

    const timeEl = screen.getByText('1:30')
    const row = timeEl.closest('div')!
    const buttons = Array.from(row.querySelectorAll('button'))
    const minusBtn = buttons.find(b => b.textContent?.trim() === '-')!
    fireEvent.click(minusBtn)

    await waitFor(async () => {
      const s = await db.settings.toCollection().first()
      expect(s?.restTimer1).toBe(60) // 90 - 30
    })
  })

  it('timer - button clamps at 30 s minimum', async () => {
    // Set timer to 30 (minimum)
    await db.settings.clear()
    await db.settings.add({
      restTimer1: 30, restTimer2: 180, restTimerFail: 300,
      theme: 'dark', barWeight: 45, plates: DEFAULT_PLATES,
    })
    await loadSettings()

    renderSettings()
    await screen.findByText('0:30')

    const timeEl = screen.getByText('0:30')
    const row = timeEl.closest('div')!
    const buttons = Array.from(row.querySelectorAll('button'))
    const minusBtn = buttons.find(b => b.textContent?.trim() === '-')!
    fireEvent.click(minusBtn)

    await waitFor(async () => {
      const s = await db.settings.toCollection().first()
      expect(s?.restTimer1).toBe(30) // clamped
    })
  })
})

// ─── Settings — plates ────────────────────────────────────────────────────────

describe('Settings — plates', () => {
  afterEach(drain)

  it('incrementing a plate weight absent from settings adds it to plates array', async () => {
    await db.settings.clear()
    await db.settings.add({
      restTimer1: 90, restTimer2: 180, restTimerFail: 300,
      theme: 'dark', barWeight: 45, plates: [],
    })
    await loadSettings()

    renderSettings()
    await screen.findByText('45 lb')

    const plateSpan = screen.getByText('45 lb')
    const row = plateSpan.closest('div')!
    const plusBtn = Array.from(row.querySelectorAll('button')).find(b => b.textContent?.trim() === '+')!
    fireEvent.click(plusBtn)

    await waitFor(async () => {
      const s = await db.settings.toCollection().first()
      expect(s?.plates?.some(p => p.weight === 45 && p.count > 0)).toBe(true)
    })
  })

  it('incrementing a plate weight already in settings updates its count', async () => {
    await db.settings.clear()
    await db.settings.add({
      restTimer1: 90, restTimer2: 180, restTimerFail: 300,
      theme: 'dark', barWeight: 45,
      // Single plate so the map callback only produces plain objects (no Proxy returned unchanged)
      plates: [{ weight: 45, count: 4 }],
    })
    await loadSettings()

    renderSettings()
    await screen.findByText('45 lb')

    const plateSpan = screen.getByText('45 lb')
    const row = plateSpan.closest('div')!
    const plusBtn = Array.from(row.querySelectorAll('button')).find(b => b.textContent?.trim() === '+')!
    fireEvent.click(plusBtn)

    await waitFor(async () => {
      const s = await db.settings.toCollection().first()
      const plate = s?.plates?.find(p => p.weight === 45)
      expect(plate?.count).toBe(5)
    })
  })


})

// ─── Settings — exercise with increment ──────────────────────────────────────

describe('Settings — exercise increment stepper', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
  })

  afterEach(drain)

  it('editing exercise with an accessory TM shows Increment stepper (ALL EXERCISES section)', async () => {
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.accessoryTrainingMaxes.add({ exerciseId: exId, weight: 50, incrementLb: 2.5, setAt: new Date() })

    renderSettings()
    await screen.findByText('Chinup')

    const editBtns = await screen.findAllByText('edit')
    fireEvent.click(editBtns[0])

    await waitFor(() => expect(document.body.textContent).toContain('Increment'))
  })

  it('editing per-lift exercise with an accessory TM shows Increment stepper', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    await db.accessoryTrainingMaxes.add({ exerciseId: exId, weight: 50, incrementLb: 2.5, setAt: new Date() })

    renderSettings()
    // Wait for OHP section and Chinup to appear in per-lift section
    await screen.findByText('Chinup')

    // DOM order: [0] = TM section OHP edit, [1] = per-lift OHP section edit, [2] = ALL EXERCISES edit
    const editBtns = await screen.findAllByText('edit')
    fireEvent.click(editBtns[1]) // per-lift section edit

    await waitFor(() => expect(document.body.textContent).toContain('Increment'))
  })
})

// ─── Settings — import ────────────────────────────────────────────────────────

describe('Settings — import error', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
  })

  afterEach(drain)

  it('successful import shows "Import complete" toast', async () => {
    renderSettings()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const validData = JSON.stringify({
      exportedAt: new Date().toISOString(), version: 1,
      lifts: [], trainingMaxes: [], accessoryTrainingMaxes: [],
      cycles: [], sessions: [], sets: [], exercises: [],
      liftAccessories: [], accessorySets: [], settings: [],
    })
    const goodFile = new File([validData], 'export.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [goodFile], configurable: true })
    fireEvent.change(fileInput)

    await screen.findByText(/Overwrite all data with export\.json/)
    fireEvent.click(screen.getByText('IMPORT'))

    await waitFor(() => expect(toast()).toBe('Import complete'))
  })

  it('cancelling import confirmation dialog closes dialog without running import', async () => {
    // Seed a lift so we can verify it's not cleared by an import
    await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    renderSettings()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const validData = JSON.stringify({
      exportedAt: new Date().toISOString(), version: 1,
      lifts: [], trainingMaxes: [], accessoryTrainingMaxes: [],
      cycles: [], sessions: [], sets: [], exercises: [],
      liftAccessories: [], accessorySets: [], settings: [],
    })
    const goodFile = new File([validData], 'export.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [goodFile], configurable: true })
    fireEvent.change(fileInput)

    await screen.findByText(/Overwrite all data with export\.json/)
    fireEvent.click(screen.getByText('CANCEL'))

    // Dialog closes; the seeded lift was NOT wiped by import
    await waitFor(() => expect(screen.queryByText(/Overwrite all data/)).not.toBeInTheDocument())
    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(1) // not cleared → import did not run
  })

  it('shows error message when imported file contains invalid JSON', async () => {
    renderSettings()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const badFile = new File(['{not valid json{{'], 'bad.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [badFile], configurable: true })
    fireEvent.change(fileInput)

    await screen.findByText(/Overwrite all data with bad\.json/)
    fireEvent.click(screen.getByText('IMPORT'))

    await waitFor(() => {
      const dangerEl = document.querySelector('.text-danger')
      expect(dangerEl?.textContent?.length).toBeGreaterThan(0)
    })
  })
})

describe('Settings — SUPPLEMENTAL', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
      db.settings.clear(),
    ])
    await seedLifts()
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300, supplementalTemplate: 'fsl+bbb' })
    await loadSettings()
  })

  afterEach(drain)

  it('renders SUPPLEMENTAL section with a single set of template buttons', async () => {
    renderSettings()
    const fslBtns = await screen.findAllByText('FSL')
    expect(fslBtns.length).toBe(1)
  })

  it('FSL+BBB button is highlighted by default', async () => {
    renderSettings()
    const btn = await screen.findByText('FSL+BBB')
    expect(btn.className).toContain('border-accent')
  })

  it('clicking BBS persists supplementalTemplate to settings in DB', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('BBS'))

    await waitFor(async () => {
      const row = await db.settings.toCollection().first()
      expect(row?.supplementalTemplate).toBe('bbs')
    })
  })

  it('clicking NONE persists supplementalTemplate to settings in DB', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('NONE'))

    await waitFor(async () => {
      const row = await db.settings.toCollection().first()
      expect(row?.supplementalTemplate).toBe('none')
    })
  })

  it('selected template button shows accent styling after click', async () => {
    renderSettings()
    fireEvent.click(await screen.findByText('SSL'))

    await waitFor(() => {
      expect(screen.getByText('SSL').className).toContain('border-accent')
    })
  })
})

// ─── Settings — skip deload (week 4) ─────────────────────────────────────────

describe('Settings — skip deload', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(),
      db.settings.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(), db.accessorySets.clear(),
    ])
  })

  afterEach(drain)

  // Seed 4 lifts + TMs + cycle + weeks 1-3 completed → currentCycleWeek = 4
  async function seedWeek4Context() {
    const liftIds = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await Promise.all(liftIds.map(liftId =>
      db.trainingMaxes.add({ liftId, weight: 100, setAt: new Date() })
    ))
    for (const week of [1, 2, 3] as const) {
      for (const liftId of liftIds) {
        await db.sessions.add({ cycleId, liftId, week, date: new Date(), notes: null, status: 'completed' })
      }
    }
    return { cycleId, liftIds }
  }

  it('SKIP DELOAD button is visible only in week 4', async () => {
    await seedWeek4Context()
    renderSettings()
    await screen.findByText('SKIP DELOAD')
  })

  it('cancelling skip deload confirmation leaves DB unchanged', async () => {
    await seedWeek4Context()
    renderSettings()
    fireEvent.click(await screen.findByText('SKIP DELOAD'))
    await screen.findByText('CANCEL')
    fireEvent.click(screen.getByText('CANCEL'))
    await drain()
    expect(await db.cycles.count()).toBe(1)
    expect(await db.sessions.count()).toBe(12) // weeks 1-3, 4 lifts each
  })

  it('confirming skip deload creates skipped week-4 sessions and advances cycle', async () => {
    await seedWeek4Context()
    renderSettings()

    fireEvent.click(await screen.findByText('SKIP DELOAD'))
    await screen.findByText('CANCEL') // dialog open

    // Both the Settings button and dialog confirm say "SKIP DELOAD"; click the dialog's
    const skipBtns = screen.getAllByText('SKIP DELOAD')
    fireEvent.click(skipBtns[skipBtns.length - 1])

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
    // New cycle created by advanceCycleIfComplete
    expect(await db.cycles.count()).toBe(2)
    // 12 (weeks 1-3) + 4 (skipped week 4) = 16 sessions
    const week4Sessions = await db.sessions.filter(s => s.week === 4).toArray()
    expect(week4Sessions).toHaveLength(4)
    expect(week4Sessions.every(s => s.status === 'skipped')).toBe(true)
  })

  it('confirming skip deload from mid-week-4 marks only pending sessions skipped', async () => {
    const { cycleId, liftIds } = await seedWeek4Context()
    // liftIds[0] already has a completed week-4 session
    await db.sessions.add({ cycleId, liftId: liftIds[0], week: 4, date: new Date(), notes: null, status: 'completed' })
    // liftIds[1] has a pending week-4 session
    await db.sessions.add({ cycleId, liftId: liftIds[1], week: 4, date: new Date(), notes: null, status: 'pending' })
    renderSettings()

    fireEvent.click(await screen.findByText('SKIP DELOAD'))
    await screen.findByText('CANCEL')
    const skipBtns = screen.getAllByText('SKIP DELOAD')
    fireEvent.click(skipBtns[skipBtns.length - 1])

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))

    const week4 = await db.sessions.filter(s => s.week === 4).toArray()
    const completed = week4.filter(s => s.status === 'completed')
    const skipped = week4.filter(s => s.status === 'skipped')
    expect(completed).toHaveLength(1) // liftIds[0] kept as completed
    expect(skipped.length).toBeGreaterThanOrEqual(3) // liftIds[1] + liftIds[2,3] created as skipped
  })

  it('CONTINUE in Settings CycleCompleteModal dismisses modal and reloads data (covers onDismiss)', async () => {
    await seedWeek4Context()
    renderSettings()

    fireEvent.click(await screen.findByText('SKIP DELOAD'))
    await screen.findByText('CANCEL')
    const skipBtns = screen.getAllByText('SKIP DELOAD')
    fireEvent.click(skipBtns[skipBtns.length - 1])

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
    fireEvent.click(screen.getByText('CONTINUE'))

    await waitFor(() => expect(screen.queryByText('CYCLE COMPLETE')).toBeNull())
  })

  it('DELOAD INSTEAD in Settings CycleCompleteModal deloads TMs and dismisses modal (covers onDeload)', async () => {
    const { liftIds } = await seedWeek4Context()
    renderSettings()

    fireEvent.click(await screen.findByText('SKIP DELOAD'))
    await screen.findByText('CANCEL')
    const skipBtns = screen.getAllByText('SKIP DELOAD')
    fireEvent.click(skipBtns[skipBtns.length - 1])

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
    fireEvent.click(screen.getByText(/DELOAD INSTEAD/))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.where('liftId').equals(liftIds[0]).sortBy('setAt')
      // applyTmProgression: 100→105; then deloadTms: round(105*(1-0.10)/5)*5 = round(94.5/5)*5 = 95
      expect(tms[tms.length - 1].weight).toBe(95)
    })
    await waitFor(() => expect(screen.queryByText('CYCLE COMPLETE')).toBeNull())
  })

  it('double-increment in CycleCompleteModal (via Settings) updates TM and removes candidate', async () => {
    // Math (TM=100, progressionIncrement=5):
    //   Week 1: 85 lbs × 13 reps → e1RM=121.8, suggestedTm=110, delta=10% ✓
    //   Week 2: 90 lbs × 11 reps → e1RM=123.0, suggestedTm=110, delta=10% ✓
    //   Week 3: 95 lbs × 9  reps → e1RM=123.5, suggestedTm=110, delta=10% ✓
    //   After applyTmProgression: TM 100→105; onDoubleIncrement adds 5 more → 110.
    const [squatId, benchId, deadliftId, ohpId] = await seedLifts()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })

    for (const liftId of [squatId, benchId, deadliftId, ohpId]) {
      await db.trainingMaxes.add({ liftId, weight: 100, setAt: new Date() })
    }

    // Weeks 1-3 for all lifts so currentCycleWeek()===4 and SKIP DELOAD is visible
    for (const week of [1, 2, 3] as const) {
      for (const liftId of [benchId, deadliftId, ohpId]) {
        await db.sessions.add({ cycleId, liftId, week, date: new Date(), notes: null, status: 'completed' })
      }
      // Squat gets qualifying AMRAP sets
      const sid = await db.sessions.add({
        cycleId, liftId: squatId, week, date: new Date(), notes: null, status: 'completed',
      })
      const amrapByWeek: Record<1 | 2 | 3, { weight: number; reps: number }> = {
        1: { weight: 85, reps: 13 },
        2: { weight: 90, reps: 11 },
        3: { weight: 95, reps: 9 },
      }
      const { weight, reps } = amrapByWeek[week]
      await db.sets.add({ sessionId: sid, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
    }

    renderSettings()

    fireEvent.click(await screen.findByText('SKIP DELOAD'))
    await screen.findByText('CANCEL')
    const skipBtns = screen.getAllByText('SKIP DELOAD')
    fireEvent.click(skipBtns[skipBtns.length - 1])

    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'), { timeout: 5000 })
    const dblBtn = await screen.findByText('+10 LBS')
    fireEvent.click(dblBtn)

    // TM: 100 (start) + 5 (progression) + 5 (doubling) = 110
    await waitFor(async () => {
      const tms = await db.trainingMaxes.where('liftId').equals(squatId).sortBy('setAt')
      expect(tms[tms.length - 1].weight).toBe(110)
    })
    // Squat removed from STRONG CYCLE candidates
    await waitFor(() => expect(screen.queryByText('+10 LBS')).toBeNull())
  })
})

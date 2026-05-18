import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import Settings from './Settings'
import { ConfirmationContext, createConfirmation } from '../hooks/use-confirmation'
import ConfirmationDialog from '../components/modals/ConfirmationDialog'
import { db } from '../db/index'

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

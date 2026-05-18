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

describe('Settings — CLEANUP ORPHANS', () => {
  beforeEach(async () => {
    await Promise.all([
      db.exercises.clear(),
      db.liftAccessories.clear(),
      db.accessoryTrainingMaxes.clear(),
      db.accessorySets.clear(),
      db.sessions.clear(),
      db.lifts.clear(),
    ])
  })

  afterEach(async () => {
    for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0))
  })

  it('cancel does not modify DB', async () => {
    const exId = await db.exercises.add({ name: 'Curl', type: 'reps' })
    await db.liftAccessories.add({ liftId: 1, exerciseId: 9999, order: 0 })

    renderSettings()
    fireEvent.click(await screen.findByText('CLEANUP ORPHANS'))
    fireEvent.click(await screen.findByText('CANCEL'))

    const las = await db.liftAccessories.toArray()
    expect(las).toHaveLength(1)
    const ex = await db.exercises.get(exId)
    expect(ex?.archived).toBeFalsy()
  })

  it('removes orphan liftAccessory rows', async () => {
    await db.exercises.add({ name: 'Curl', type: 'reps' })
    const exId2 = await db.exercises.add({ name: 'Row', type: 'reps' })
    await db.liftAccessories.add({ liftId: 1, exerciseId: 9999, order: 0 }) // orphan
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

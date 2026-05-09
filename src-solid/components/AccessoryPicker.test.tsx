import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import { clearSession } from '../store/workoutStore'
import { db } from '../../src/db/db'
import AccessoryPicker from './AccessoryPicker'

beforeEach(async () => {
  clearSession()
  await db.delete()
  await db.open()
  await db.exercises.add({ id: 1, name: 'Curl', type: 'reps' })
  await db.exercises.add({ id: 2, name: 'Row', type: 'reps' })
  await db.liftAccessories.add({ liftId: 1, exerciseId: 1, order: 1 })
  await db.liftAccessories.add({ liftId: 1, exerciseId: 2, order: 2 })
  // Curl has TM=100, Row has no TM
  await db.accessoryTrainingMaxes.add({ exerciseId: 1, weight: 100, incrementLb: 5, setAt: new Date() })
})

afterEach(async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0))
  }
})

describe('AccessoryPicker', () => {
  it('shows SELECT ASSISTANCE EXERCISE heading', async () => {
    render(() => <AccessoryPicker liftId={1} onClose={() => {}} />)
    expect(await screen.findByText(/SELECT ASSISTANCE EXERCISE/i)).toBeInTheDocument()
  })

  it('lists exercises from DB', async () => {
    render(() => <AccessoryPicker liftId={1} onClose={() => {}} />)
    expect(await screen.findByText(/Curl/)).toBeInTheDocument()
    expect(screen.getByText(/Row/)).toBeInTheDocument()
  })

  it('shows calculated weight for exercise with TM', async () => {
    // Curl: TM=100, 5x10 @ roundToNearest5(100*0.75)=75
    render(() => <AccessoryPicker liftId={1} onClose={() => {}} />)
    expect(await screen.findByText(/5x10 @ 75lb/)).toBeInTheDocument()
  })

  it('shows NOT SET for exercise without TM', async () => {
    render(() => <AccessoryPicker liftId={1} onClose={() => {}} />)
    expect(await screen.findByText('NOT SET')).toBeInTheDocument()
  })

  it('calls onClose after selecting exercise with TM', async () => {
    const closes: number[] = []
    render(() => <AccessoryPicker liftId={1} onClose={() => closes.push(1)} />)
    const curlBtn = await screen.findByRole('button', { name: /Curl/ })
    fireEvent.click(curlBtn)
    expect(closes).toHaveLength(1)
  })

  it('shows SET TRAINING MAX screen when selecting exercise without TM', async () => {
    render(() => <AccessoryPicker liftId={1} onClose={() => {}} />)
    const rowBtn = await screen.findByRole('button', { name: /Row/ })
    fireEvent.click(rowBtn)
    expect(await screen.findByText(/SET TRAINING MAX/i)).toBeInTheDocument()
  })

  it('shows BACK button on SET TRAINING MAX screen', async () => {
    render(() => <AccessoryPicker liftId={1} onClose={() => {}} />)
    const rowBtn = await screen.findByRole('button', { name: /Row/ })
    fireEvent.click(rowBtn)
    expect(await screen.findByRole('button', { name: /^BACK$/i })).toBeInTheDocument()
  })
})

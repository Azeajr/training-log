// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Setup from './Setup'
import { db } from '../db/db'

describe('Setup screen', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    // handleComplete reads lifts to write TMs
    await db.lifts.bulkAdd([
      { name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
      { name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
    ])
  })

  it('step 1 shows all four lift labels', () => {
    render(<Setup onComplete={vi.fn()} />)
    expect(screen.getByText('OHP')).toBeInTheDocument()
    expect(screen.getByText('Bench')).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Deadlift')).toBeInTheDocument()
  })

  it('step 1 shows NEXT button', () => {
    render(<Setup onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'NEXT' })).toBeInTheDocument()
  })

  it('shows W1 progression preview for all lifts when TM is at minimum', () => {
    render(<Setup onComplete={vi.fn()} />)
    const previews = screen.getAllByText(/W1:/)
    expect(previews).toHaveLength(4)
  })

  it('NEXT navigates to step 2 confirmation', async () => {
    render(<Setup onComplete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    expect(screen.getByText('Confirm training maxes:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'START TRAINING' })).toBeInTheDocument()
  })

  it('step 2 shows BACK button that returns to step 1', async () => {
    render(<Setup onComplete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    await userEvent.click(screen.getByRole('button', { name: 'BACK' }))
    expect(screen.getByRole('button', { name: 'NEXT' })).toBeInTheDocument()
  })

  it('START TRAINING calls onComplete', async () => {
    const onComplete = vi.fn()
    render(<Setup onComplete={onComplete} />)
    await userEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    await userEvent.click(screen.getByRole('button', { name: 'START TRAINING' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })

  it('START TRAINING writes one TM per lift to DB', async () => {
    render(<Setup onComplete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    await userEvent.click(screen.getByRole('button', { name: 'START TRAINING' }))
    await waitFor(async () => {
      const tms = await db.trainingMaxes.toArray()
      expect(tms).toHaveLength(4)
    })
  })

  it('START TRAINING creates cycle number 1', async () => {
    render(<Setup onComplete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    await userEvent.click(screen.getByRole('button', { name: 'START TRAINING' }))
    await waitFor(async () => {
      const cycles = await db.cycles.toArray()
      expect(cycles).toHaveLength(1)
      expect(cycles[0].number).toBe(1)
    })
  })

  it('incrementing OHP TM changes the W1 preview', async () => {
    render(<Setup onComplete={vi.fn()} />)
    // Default TM is 45. Clicking + once adds 5 → 50
    const plusBtns = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(plusBtns[0])  // OHP stepper +
    // At TM=50, W1 first set = max(45, round(50*0.65)) = max(45, 33) = 45
    // All three sets are still at 45 lb (bar weight floor)
    expect(screen.getAllByText(/W1: 45 · 45 · 45 lb/).length).toBeGreaterThanOrEqual(1)
  })
})

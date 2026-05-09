import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import SessionPreview from './SessionPreview'
import type { WarmupSet, MainSet, FslSet } from '../../src/lib/calc'

const WARMUP: WarmupSet[] = [
  { setNumber: 1, weight: 45, reps: 10, type: 'warmup' },
  { setNumber: 2, weight: 65, reps: 5, type: 'warmup' },
  { setNumber: 3, weight: 80, reps: 3, type: 'warmup' },
]
const MAIN: MainSet[] = [
  { setNumber: 1, weight: 130, reps: 5, isAmrap: false, type: 'main' },
  { setNumber: 2, weight: 150, reps: 5, isAmrap: false, type: 'main' },
  { setNumber: 3, weight: 170, reps: 5, isAmrap: true, type: 'main' },
]
const FSL: FslSet[] = Array.from({ length: 5 }, (_, i) => ({
  setNumber: i + 1, weight: 130, reps: 10, type: 'fsl' as const,
}))

describe('SessionPreview', () => {
  it('shows WARM UP label', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText(/WARM UP/i)).toBeInTheDocument()
  })

  it('shows MAIN label', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText(/^MAIN$/)).toBeInTheDocument()
  })

  it('shows FSL label', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText(/FSL/)).toBeInTheDocument()
  })

  it('renders warmup weights', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText('45lb')).toBeInTheDocument()
    expect(screen.getByText('65lb')).toBeInTheDocument()
    expect(screen.getByText('80lb')).toBeInTheDocument()
  })

  it('renders main set weights', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText('150lb')).toBeInTheDocument()
    expect(screen.getByText('170lb')).toBeInTheDocument()
  })

  it('shows AMRAP label on amrap set', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText('AMRAP')).toBeInTheDocument()
  })

  it('renders all warmup set reps', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    // reps=10 appears in warmup row and FSL; reps=3 is unique to warmup
    expect(screen.getAllByText('x 10').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('x 3')).toBeInTheDocument()
  })

  it('shows FSL 5x10 label', () => {
    render(() => <SessionPreview warmup={WARMUP} main={MAIN} fsl={FSL} />)
    expect(screen.getByText(/FSL.*5.*10/)).toBeInTheDocument()
  })
})

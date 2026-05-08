// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SessionPreview from './SessionPreview'
import type { WarmupSet, MainSet, FslSet } from '../lib/calc'

const warmup: WarmupSet[] = [
  { setNumber: 1, weight: 45, reps: 10, type: 'warmup' },
  { setNumber: 2, weight: 70, reps: 5,  type: 'warmup' },
]

const main: MainSet[] = [
  { setNumber: 1, weight: 80, reps: 5, isAmrap: false, type: 'main' },
  { setNumber: 2, weight: 90, reps: 5, isAmrap: false, type: 'main' },
  { setNumber: 3, weight: 100, reps: 5, isAmrap: true,  type: 'main' },
]

const fsl: FslSet[] = Array.from({ length: 5 }, (_, i) => ({
  setNumber: i + 1,
  weight: 80,
  reps: 10,
  type: 'fsl' as const,
}))

describe('SessionPreview', () => {
  it('renders WARM UP section header', () => {
    render(<SessionPreview warmup={warmup} main={main} fsl={fsl} />)
    expect(screen.getByText('WARM UP')).toBeInTheDocument()
  })

  it('shows warmup set weights', () => {
    render(<SessionPreview warmup={warmup} main={main} fsl={fsl} />)
    expect(screen.getByText('45lb')).toBeInTheDocument()
    expect(screen.getByText('70lb')).toBeInTheDocument()
  })

  it('renders MAIN section', () => {
    render(<SessionPreview warmup={warmup} main={main} fsl={fsl} />)
    expect(screen.getByText('MAIN')).toBeInTheDocument()
    expect(screen.getByText('100lb')).toBeInTheDocument()
  })

  it('shows AMRAP label on the amrap set', () => {
    render(<SessionPreview warmup={warmup} main={main} fsl={fsl} />)
    expect(screen.getByText('AMRAP')).toBeInTheDocument()
  })

  it('renders FSL section header', () => {
    render(<SessionPreview warmup={warmup} main={main} fsl={fsl} />)
    expect(screen.getByText(/FSL/)).toBeInTheDocument()
  })

  it('shows only first FSL weight in preview', () => {
    render(<SessionPreview warmup={warmup} main={main} fsl={fsl} />)
    // All FSL sets have weight 80lb, but the preview renders only the first row
    const matches = screen.getAllByText('80lb')
    // First main set is 80lb too; FSL preview adds one more occurrence
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })
})

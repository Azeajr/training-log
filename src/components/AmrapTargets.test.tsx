// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../lib/calc'

describe('AmrapTargets', () => {
  it('renders nothing for empty targets', () => {
    const { container } = render(<AmrapTargets targets={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each target with uppercased label and rep count', () => {
    const targets: AmrapTarget[] = [
      { label: 'Last session', reps: 8, est1RM: 215 },
      { label: 'Last cycle', reps: 5, est1RM: 200 },
    ]
    render(<AmrapTargets targets={targets} />)
    expect(screen.getByText(/LAST SESSION/)).toBeInTheDocument()
    expect(screen.getByText(/8 reps/)).toBeInTheDocument()
    expect(screen.getByText(/LAST CYCLE/)).toBeInTheDocument()
    expect(screen.getByText(/5 reps/)).toBeInTheDocument()
  })

  it('shows estimated 1RM for each target', () => {
    const targets: AmrapTarget[] = [
      { label: 'Last session', reps: 10, est1RM: 250.5 },
    ]
    render(<AmrapTargets targets={targets} />)
    expect(screen.getByText(/250\.5lb est\. 1RM/)).toBeInTheDocument()
  })

  it('pads label with spaces to fixed width', () => {
    const targets: AmrapTarget[] = [
      { label: 'Hi', reps: 3, est1RM: 100 },
    ]
    const { container } = render(<AmrapTargets targets={targets} />)
    expect(container.firstChild).not.toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { render } from '@solidjs/testing-library'
import AmrapTargets from './AmrapTargets'

describe('AmrapTargets', () => {
  it('renders nothing when targets is empty', () => {
    const { container } = render(() => <AmrapTargets targets={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows uppercased label', () => {
    const { container } = render(() => (
      <AmrapTargets targets={[{ label: 'last session', reps: 15, est1RM: 250.67 }]} />
    ))
    expect(container.textContent).toContain('LAST SESSION')
  })

  it('shows rep count', () => {
    const { container } = render(() => (
      <AmrapTargets targets={[{ label: 'Last session', reps: 15, est1RM: 250.67 }]} />
    ))
    expect(container.textContent).toContain('15 reps')
  })

  it('shows estimated 1RM', () => {
    const { container } = render(() => (
      <AmrapTargets targets={[{ label: 'Last session', reps: 15, est1RM: 250.67 }]} />
    ))
    expect(container.textContent).toContain('250.67lb est. 1RM')
  })

  it('renders all targets when multiple provided', () => {
    const targets = [
      { label: 'Week 1', reps: 10, est1RM: 200 },
      { label: 'Week 2', reps: 12, est1RM: 220 },
    ]
    const { container } = render(() => <AmrapTargets targets={targets} />)
    expect(container.textContent).toContain('WEEK 1')
    expect(container.textContent).toContain('WEEK 2')
    expect(container.textContent).toContain('10 reps')
    expect(container.textContent).toContain('12 reps')
  })
})

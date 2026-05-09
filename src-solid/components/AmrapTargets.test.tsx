import { describe, it, expect } from 'vitest'
import { render } from '@solidjs/testing-library'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../../src/lib/calc'

const TARGETS: AmrapTarget[] = [
  { label: 'Week 1', reps: 8, est1RM: 220.5 },
  { label: 'Week 2', reps: 6, est1RM: 215 },
]

describe('AmrapTargets', () => {
  it('renders nothing when targets array is empty', () => {
    const { container } = render(() => <AmrapTargets targets={[]} />)
    expect(container.textContent).toBe('')
  })

  it('shows rep counts for all targets', () => {
    const { container } = render(() => <AmrapTargets targets={TARGETS} />)
    expect(container.textContent).toContain('8 reps')
    expect(container.textContent).toContain('6 reps')
  })

  it('shows estimated 1RM values', () => {
    const { container } = render(() => <AmrapTargets targets={TARGETS} />)
    expect(container.textContent).toContain('220.5lb est. 1RM')
    expect(container.textContent).toContain('215lb est. 1RM')
  })

  it('shows label in uppercase', () => {
    const { container } = render(() => <AmrapTargets targets={TARGETS} />)
    expect(container.textContent).toContain('WEEK 1')
    expect(container.textContent).toContain('WEEK 2')
  })

  it('renders one row per target', () => {
    const { container } = render(() => <AmrapTargets targets={TARGETS} />)
    const rows = container.querySelectorAll('.text-warn')
    expect(rows.length).toBe(2)
  })
})

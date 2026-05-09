import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import PlateDisplay from './PlateDisplay'

describe('PlateDisplay', () => {
  it('shows "bar only" when weight equals barWeight (45)', () => {
    render(() => <PlateDisplay weight={45} />)
    expect(screen.getByText(/bar only/i)).toBeInTheDocument()
  })

  it('shows plates for 135lb (each side: 45)', () => {
    render(() => <PlateDisplay weight={135} />)
    const text = screen.getByText(/each side/).textContent ?? ''
    expect(text).toContain('45')
  })

  it('shows multiple plate types for heavier weight', () => {
    // 185lb: perSide=70 → 45 + 25
    render(() => <PlateDisplay weight={185} />)
    const text = screen.getByText(/each side/).textContent ?? ''
    expect(text).toContain('45')
    expect(text).toContain('25')
  })

  it('renders nothing for weight below barWeight', () => {
    // calcPlatesPerSide returns null when perSide < 0
    const { container } = render(() => <PlateDisplay weight={20} />)
    expect(container.textContent).toBe('')
  })

  it('shows "bar only" for weight exactly at barWeight with no extra plates', () => {
    render(() => <PlateDisplay weight={45} />)
    expect(screen.queryByText(/each side/)).toBeNull()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlateDisplay from './PlateDisplay'

vi.mock('../store/settingsStore', () => ({
  useSettingsStore: vi.fn(),
}))

import { useSettingsStore } from '../store/settingsStore'

const mockStore = (barWeight = 45, plates = [
  { weight: 45, count: 4 },
  { weight: 35, count: 2 },
  { weight: 25, count: 4 },
  { weight: 15, count: 2 },
  { weight: 10, count: 4 },
  { weight: 5,  count: 4 },
  { weight: 2.5, count: 4 },
]) => {
  ;(useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ barWeight, plates })
}

beforeEach(() => mockStore())

describe('PlateDisplay', () => {
  it('shows per-side plate list for a standard weight', () => {
    render(<PlateDisplay weight={275} />)
    expect(screen.getByText('each side: 45 · 45 · 25')).toBeInTheDocument()
  })

  it('shows "bar only" when target equals bar weight', () => {
    render(<PlateDisplay weight={45} />)
    expect(screen.getByText('bar only')).toBeInTheDocument()
  })

  it('renders nothing when weight cannot be made with available plates', () => {
    mockStore(45, [{ weight: 45, count: 4 }])
    const { container } = render(<PlateDisplay weight={160} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when weight is below bar weight', () => {
    const { container } = render(<PlateDisplay weight={25} />)
    expect(container.firstChild).toBeNull()
  })
})

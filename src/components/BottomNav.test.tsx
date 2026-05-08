// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from './BottomNav'

function renderNav(path = '/today') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>
  )
}

describe('BottomNav', () => {
  it('renders all four navigation tabs', () => {
    renderNav()
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    expect(screen.getByText('WORKOUT')).toBeInTheDocument()
    expect(screen.getByText('HISTORY')).toBeInTheDocument()
    expect(screen.getByText('SETTINGS')).toBeInTheDocument()
  })

  it('today tab is active on /today', () => {
    renderNav('/today')
    const link = screen.getByText('TODAY').closest('a')
    expect(link).toHaveClass('text-accent')
  })

  it('history tab is not active on /today', () => {
    renderNav('/today')
    const link = screen.getByText('HISTORY').closest('a')
    expect(link).not.toHaveClass('text-accent')
  })

  it('workout tab is active on /workout', () => {
    renderNav('/workout')
    const link = screen.getByText('WORKOUT').closest('a')
    expect(link).toHaveClass('text-accent')
  })

  it('settings tab is active on /settings', () => {
    renderNav('/settings')
    const link = screen.getByText('SETTINGS').closest('a')
    expect(link).toHaveClass('text-accent')
  })

  it('each tab links to the correct route', () => {
    renderNav()
    expect(screen.getByText('TODAY').closest('a')).toHaveAttribute('href', '/today')
    expect(screen.getByText('WORKOUT').closest('a')).toHaveAttribute('href', '/workout')
    expect(screen.getByText('HISTORY').closest('a')).toHaveAttribute('href', '/history')
    expect(screen.getByText('SETTINGS').closest('a')).toHaveAttribute('href', '/settings')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { clearSession, startSession } from '../store/workoutStore'
import BottomNav from './BottomNav'

beforeEach(() => clearSession())

const renderNav = () =>
  render(() => (
    <Router>
      <Route path="*" component={BottomNav} />
    </Router>
  ))

describe('BottomNav', () => {
  it('renders all four tabs', () => {
    renderNav()
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    expect(screen.getByText('WORKOUT')).toBeInTheDocument()
    expect(screen.getByText('HISTORY')).toBeInTheDocument()
    expect(screen.getByText('SETTINGS')).toBeInTheDocument()
  })

  it('shows no session dot without active session', () => {
    renderNav()
    expect(document.querySelector('.rounded-full')).toBeNull()
  })

  it('shows session dot on WORKOUT tab when session is active', () => {
    startSession({
      id: 1,
      cycleId: 1,
      liftId: 1,
      week: 1,
      date: new Date(),
      notes: null,
      status: 'pending',
    })
    renderNav()
    expect(document.querySelector('.rounded-full')).toBeInTheDocument()
  })

  it('session dot disappears after session is cleared', () => {
    startSession({
      id: 1,
      cycleId: 1,
      liftId: 1,
      week: 1,
      date: new Date(),
      notes: null,
      status: 'pending',
    })
    renderNav()
    expect(document.querySelector('.rounded-full')).toBeInTheDocument()
    clearSession()
    expect(document.querySelector('.rounded-full')).toBeNull()
  })
})

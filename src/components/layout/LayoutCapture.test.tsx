import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import LayoutCapture from './LayoutCapture'
import Modal from '../modals/Modal'
import { reloadTrace, setTraceEnabled, readTrace } from '../../lib/trace'
import { toast } from '../../store/toast-store'

let pathname = '/workout'
vi.mock('@solidjs/router', () => ({ useLocation: () => ({ get pathname() { return pathname } }) }))

beforeEach(() => {
  localStorage.clear()
  reloadTrace()
  setTraceEnabled(true)
  pathname = '/workout'
})
afterEach(() => { setTraceEnabled(false) })

const captures = () => readTrace().filter(e => e.ev === 'layout.capture')

describe('LayoutCapture', () => {
  it('captures via shortcut inside a focus-trapped modal without moving focus', () => {
    render(() => <><LayoutCapture /><Modal title="Issue" onClose={() => {}}><button>Modal action</button></Modal></>)
    const action = screen.getByRole('button', { name: 'Modal action' })
    expect(document.activeElement).toBe(action)
    fireEvent.keyDown(action, { key: 'Tab' })
    expect(document.activeElement).toBe(action)
    fireEvent.keyDown(action, { code: 'KeyC', altKey: true, shiftKey: true })
    expect(captures()).toHaveLength(1)
    expect(document.activeElement).toBe(action)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('ignores the shortcut when recording is stopped', () => {
    render(() => <LayoutCapture />)
    setTraceEnabled(false)
    fireEvent.keyDown(document, { code: 'KeyC', altKey: true, shiftKey: true })
    expect(captures()).toHaveLength(0)
  })
  it('captures once for a touch sequence of pointerdown then click', () => {
    render(() => <LayoutCapture />)
    const button = screen.getByRole('button', { name: 'Capture issue' })
    fireEvent.pointerDown(button, { isPrimary: true })
    fireEvent.click(button, { detail: 1 })
    expect(captures()).toHaveLength(1)
    expect(toast()).toMatch(/Issue captured/)
  })

  it('captures on keyboard activation, and not twice for a repeat', () => {
    render(() => <LayoutCapture />)
    const button = screen.getByRole('button', { name: 'Capture issue' })
    fireEvent.click(button, { detail: 0 })
    fireEvent.click(button, { detail: 0 })
    expect(captures()).toHaveLength(1)
  })

  it('ignores non-primary pointers', () => {
    render(() => <LayoutCapture />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Capture issue' }), { isPrimary: false })
    expect(captures()).toHaveLength(0)
  })

  it.each(['/settings', '/setup'])('is hidden on %s', path => {
    pathname = path
    render(() => <LayoutCapture />)
    expect(screen.queryByRole('button', { name: 'Capture issue' })).toBeNull()
  })

  it('stops recording from the overlay', () => {
    render(() => <LayoutCapture />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    expect(screen.queryByRole('button', { name: 'Capture issue' })).toBeNull()
  })
})

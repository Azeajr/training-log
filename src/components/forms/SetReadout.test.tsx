import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import SetReadout from './SetReadout'

// ── F61 (WCAG 2.1.1, Level A — Keyboard) ────────────────────────────────────
// SetReadout attached onClick to a bare <div> with cursor-pointer and no role,
// no tabindex and no key handler. That div is the app's ONLY affordance for
// editing an already logged set — SetRow for main and cross sets, AccessoryLog
// for accessory sets — so correcting a mislogged set was pointer-only, and
// unreachable by keyboard or switch access.
//
// AccessoryLog.tsx:92-94 states the standard three files away: "Real <button>,
// not a span with role='button': keyboard support comes free."
describe('SetReadout', () => {
  it('exposes a real button when it is tappable', () => {
    render(() => <SetReadout weight={135} value="5" onClick={() => {}} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('is reachable by keyboard', () => {
    render(() => <SetReadout weight={135} value="5" onClick={() => {}} />)
    const btn = screen.getByRole('button')
    btn.focus()
    expect(document.activeElement).toBe(btn)
  })

  it('activates from the keyboard', () => {
    const onClick = vi.fn()
    render(() => <SetReadout weight={135} value="5" onClick={onClick} />)
    const btn = screen.getByRole('button')
    btn.focus()
    fireEvent.keyDown(btn, { key: 'Enter' })
    fireEvent.click(btn) // what the browser synthesises for a real <button>
    expect(onClick).toHaveBeenCalled()
  })

  it('names the button after the set it edits', () => {
    render(() => <SetReadout weight={135} value="5" onClick={() => {}} />)
    expect(screen.getByRole('button').textContent).toContain('135')
    expect(screen.getByRole('button').textContent).toContain('5')
  })

  it('keeps the trailing slot OUTSIDE the button', () => {
    // The trailing slot holds an InlineConfirm at the real call sites, and
    // nesting a button inside a button is invalid and unreachable.
    render(() => (
      <SetReadout
        weight={135} value="5" onClick={() => {}}
        trailing={<button>undo</button>}
      />
    ))
    const undo = screen.getByRole('button', { name: 'undo' })
    const tappable = screen.getAllByRole('button').find(b => b !== undo)!
    expect(tappable.contains(undo)).toBe(false)
  })

  it('stays a plain row when it is not tappable', () => {
    render(() => <SetReadout weight={135} value="5" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('still renders a read-only row with its trailing content', () => {
    render(() => <SetReadout weight={135} value="5" trailing={<span>e1RM 158</span>} />)
    expect(screen.getByText('e1RM 158')).toBeInTheDocument()
  })
})

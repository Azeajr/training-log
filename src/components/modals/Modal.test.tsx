import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import { createSignal, Show } from 'solid-js'
import Modal from './Modal'

const Body = () => (
  <>
    <button>first</button>
    <button>second</button>
    <button>third</button>
  </>
)

describe('Modal', () => {
  it('declares itself a modal dialog with an accessible name', () => {
    render(() => <Modal label="Confirm delete" onClose={() => {}}><Body /></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Confirm delete' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('prefers labelledby over label when both are given', () => {
    render(() => (
      <Modal labelledBy="t" label="ignored" onClose={() => {}}>
        <h2 id="t">Named by heading</h2>
        <Body />
      </Modal>
    ))
    expect(screen.getByRole('dialog', { name: 'Named by heading' })).toBeInTheDocument()
  })

  it('focuses the first interactive element on open', () => {
    render(() => <Modal label="d" onClose={() => {}}><Body /></Modal>)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first' }))
  })

  it('focuses the dialog itself when asked, so a destructive first button is not armed', () => {
    render(() => <Modal label="d" onClose={() => {}} initialFocus="container"><Body /></Modal>)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(() => <Modal label="d" onClose={onClose}><Body /></Modal>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    render(() => <Modal label="d" onClose={onClose}><Body /></Modal>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wraps Tab from the last element back to the first', () => {
    render(() => <Modal label="d" onClose={() => {}}><Body /></Modal>)
    const last = screen.getByRole('button', { name: 'third' })
    last.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first' }))
  })

  it('wraps Shift+Tab from the first element to the last', () => {
    render(() => <Modal label="d" onClose={() => {}}><Body /></Modal>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'third' }))
  })

  it('leaves Tab alone in the middle of the list, so the browser advances normally', () => {
    render(() => <Modal label="d" onClose={() => {}}><Body /></Modal>)
    screen.getByRole('button', { name: 'second' }).focus()
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    screen.getByRole('dialog').dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  it('keeps focus inside when the dialog has nothing focusable', () => {
    render(() => <Modal label="d" onClose={() => {}}><span>text only</span></Modal>)
    const dialog = screen.getByRole('dialog')
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    dialog.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(dialog)
  })

  it('restores focus to the opener when it unmounts', async () => {
    const [open, setOpen] = createSignal(false)
    render(() => (
      <>
        <button onClick={() => setOpen(true)}>opener</button>
        <Show when={open()}>
          <Modal label="d" onClose={() => setOpen(false)}><Body /></Modal>
        </Show>
      </>
    ))
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(await screen.findByRole('button', { name: 'first' }))

    setOpen(false)
    expect(document.activeElement).toBe(opener)
  })

  it('renders the sheet variant full-bleed with no scrim', () => {
    render(() => <Modal variant="sheet" label="d" onClose={() => {}}><Body /></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('bg-bg')
    expect(dialog.className).not.toContain('bg-black/80')
  })

  it('renders the card variant over a scrim', () => {
    render(() => <Modal label="d" onClose={() => {}}><Body /></Modal>)
    expect(screen.getByRole('dialog').className).toContain('bg-black/80')
  })
})

describe('Modal — title', () => {
  it('names the card dialog from its visible title', () => {
    render(() => <Modal title="CYCLE COMPLETE" onClose={() => {}}><Body /></Modal>)
    expect(screen.getByRole('dialog', { name: 'CYCLE COMPLETE' })).toBeInTheDocument()
  })

  it('names the sheet dialog from its visible title, not the Rule dashes', () => {
    render(() => <Modal variant="sheet" title="SELECT EXERCISE" onClose={() => {}}><Body /></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'SELECT EXERCISE' })
    // The decorative Rule still renders — it just doesn't reach the name.
    expect(dialog.textContent).toContain('--- SELECT EXERCISE')
  })

  it('lets an explicit label override a terse title', () => {
    render(() => (
      <Modal title="TM ADJUSTMENT" label="Training max adjustment for Bench" onClose={() => {}}>
        <Body />
      </Modal>
    ))
    expect(screen.getByRole('dialog', { name: 'Training max adjustment for Bench' })).toBeInTheDocument()
    expect(screen.getByText('TM ADJUSTMENT')).toBeInTheDocument()
  })

  it('gives sheets a ← BACK control wired to onClose', () => {
    const onClose = vi.fn()
    render(() => <Modal variant="sheet" title="PICK ONE" onClose={onClose}><Body /></Modal>)
    fireEvent.click(screen.getByText('← BACK'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('omits ← BACK when the sheet offers its own way out', () => {
    render(() => (
      <Modal variant="sheet" title="PICK ONE" backButton={false} onClose={() => {}}>
        <Body />
      </Modal>
    ))
    expect(screen.queryByText('← BACK')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'PICK ONE' })).toBeInTheDocument()
  })

  it('tones a card heading neutral on request', () => {
    render(() => <Modal title="DELETE?" titleTone="text" onClose={() => {}}><Body /></Modal>)
    expect(screen.getByText('DELETE?').className).toContain('text-text')
  })

  it('defaults a card heading to accent', () => {
    render(() => <Modal title="CYCLE COMPLETE" onClose={() => {}}><Body /></Modal>)
    expect(screen.getByText('CYCLE COMPLETE').className).toContain('text-accent')
  })

  it('gives each dialog its own title id so two open modals cannot collide', () => {
    render(() => <Modal title="ONE" onClose={() => {}}><Body /></Modal>)
    render(() => <Modal title="TWO" onClose={() => {}}><Body /></Modal>)
    const [a, b] = screen.getAllByRole('dialog')
    expect(a.getAttribute('aria-labelledby')).not.toBe(b.getAttribute('aria-labelledby'))
  })

  it('renders no heading at all when given no title', () => {
    render(() => <Modal label="untitled" onClose={() => {}}><Body /></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'untitled' })
    expect(dialog.getAttribute('aria-labelledby')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import CollapsibleSection from './CollapsibleSection'

const visible = (el: HTMLElement | null) => el != null && !el.closest('[hidden]')

describe('CollapsibleSection', () => {
  it('renders a plain label and its content while the section is unfinished', () => {
    render(() => (
      <CollapsibleSection label="WARM UP" complete={false}>
        <p>row</p>
      </CollapsibleSection>
    ))
    expect(screen.getByText('WARM UP')).toBeInTheDocument()
    expect(visible(screen.getByText('row'))).toBe(true)
    // No toggle at all: nothing to fumble mid-set.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('folds itself away once the section is finished', () => {
    render(() => (
      <CollapsibleSection label="WARM UP" complete summary="3 sets">
        <p>row</p>
      </CollapsibleSection>
    ))
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(visible(screen.getByText('row'))).toBe(false)
    expect(screen.getByText('3 sets done')).toBeInTheDocument()
  })

  it('keeps the content mounted when collapsed, so positional rows are not rebuilt', () => {
    render(() => (
      <CollapsibleSection label="WARM UP" complete>
        <p>row</p>
      </CollapsibleSection>
    ))
    expect(screen.getByText('row')).toBeInTheDocument()
  })

  it('reopens on demand and points aria-controls at the content', () => {
    render(() => (
      <CollapsibleSection label="WARM UP" complete summary="3 sets">
        <p>row</p>
      </CollapsibleSection>
    ))
    const toggle = screen.getByRole('button')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(visible(screen.getByText('row'))).toBe(true)
    // The summary is redundant once the rows are on screen.
    expect(screen.queryByText('3 sets done')).not.toBeInTheDocument()

    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)
    expect(panel).toContainElement(screen.getByText('row'))
  })

  it('reopens automatically when the section stops being finished', () => {
    const [complete, setComplete] = createSignal(true)
    render(() => (
      <CollapsibleSection label="WARM UP" complete={complete()}>
        <p>row</p>
      </CollapsibleSection>
    ))
    expect(visible(screen.getByText('row'))).toBe(false)

    // An undo walks the cursor back into the section — it must not stay hidden.
    setComplete(false)
    expect(visible(screen.getByText('row'))).toBe(true)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('re-folds on a fresh completion after the user opened it', () => {
    const [complete, setComplete] = createSignal(true)
    render(() => (
      <CollapsibleSection label="WARM UP" complete={complete()}>
        <p>row</p>
      </CollapsibleSection>
    ))
    fireEvent.click(screen.getByRole('button'))
    expect(visible(screen.getByText('row'))).toBe(true)

    setComplete(false)
    setComplete(true)
    expect(visible(screen.getByText('row'))).toBe(false)
  })

  it('omits the summary when none is given', () => {
    render(() => (
      <CollapsibleSection label="WARM UP" complete>
        <p>row</p>
      </CollapsibleSection>
    ))
    expect(screen.getByRole('button').textContent).toBe('WARM UP▸')
  })

  it('gives each section its own panel id', () => {
    render(() => (
      <>
        <CollapsibleSection label="A" complete><p>a</p></CollapsibleSection>
        <CollapsibleSection label="B" complete><p>b</p></CollapsibleSection>
      </>
    ))
    const [a, b] = screen.getAllByRole('button')
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'))
  })
})

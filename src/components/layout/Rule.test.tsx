import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import Rule from './Rule'

// ── F64 ─────────────────────────────────────────────────────────────────────
// Rule renders 80 hyphens as ordinary text, so they were part of the accessible
// text of every section divider in the app. Sixteen call sites exist and exactly
// one passed aria-hidden — Modal.tsx, whose comment names the problem precisely:
// "the right look and a terrible accessible name". The fix applied once at a
// call site belongs in the component.

/** Text a screen reader would read: walk nodes, skipping aria-hidden subtrees. */
function accessibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  if ((node as Element).getAttribute('aria-hidden') === 'true') return ''
  return [...node.childNodes].map(accessibleText).join('')
}

describe('Rule', () => {
  it('keeps the dash fill out of the accessible text', () => {
    const { container } = render(() => <Rule label="RECORDS" />)
    expect(container.textContent).toContain('-')       // still looks right
    expect(accessibleText(container)).not.toMatch(/-{10,}/)
    expect(accessibleText(container)).toContain('RECORDS')
  })

  it('still exposes the label itself', () => {
    render(() => <Rule label="RECORDS" />)
    expect(screen.getByText('RECORDS')).toBeInTheDocument()
  })

  it('exposes the label suffix alongside the label', () => {
    const { container } = render(() => <Rule label="BENCH" labelSuffix=". WEEK 2" />)
    expect(accessibleText(container)).toContain('BENCH')
    expect(accessibleText(container)).toContain('. WEEK 2')
  })

  it('hides a label-less divider entirely — it is pure decoration', () => {
    const { container } = render(() => <Rule />)
    expect(accessibleText(container)).not.toMatch(/-{10,}/)
  })

  it('still honours an explicit aria-hidden from a caller', () => {
    const { container } = render(() => <Rule label="X" aria-hidden="true" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})

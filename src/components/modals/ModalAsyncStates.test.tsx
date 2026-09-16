// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import ModalAsyncStates from './ModalAsyncStates'

const renderStates = (props: { error?: string | null; entries?: unknown[] | null }) =>
  render(() => (
    <ModalAsyncStates
      error={props.error ?? null}
      entries={props.entries ?? null}
      emptyText="No entries yet."
    >
      <div>THE LIST</div>
    </ModalAsyncStates>
  ))

// ── F46 ─────────────────────────────────────────────────────────────────────
// The ladder was three independent predicates over a `list()` that collapsed
// error and loading onto the same value — null whenever `error` was set OR the
// query was in flight — and the loading branch tested `list() === null`. So an
// errored sheet rendered the error message AND a permanent "Loading..."
// underneath it: the screen told the user both that it had failed and that it
// had not finished. This file did not exist.
describe('ModalAsyncStates', () => {
  it('shows only the error when there is one', () => {
    renderStates({ error: 'disk unavailable', entries: null })
    expect(screen.getByRole('alert').textContent).toBe('disk unavailable')
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('No entries yet.')).not.toBeInTheDocument()
    expect(screen.queryByText('THE LIST')).not.toBeInTheDocument()
  })

  it('shows only the error even when rows already arrived', () => {
    // The error-with-rows case: a refresh failed after a successful first load.
    // Both the error and the list were renderable at once under the old ladder.
    renderStates({ error: 'refresh failed', entries: [{ id: 1 }] })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('THE LIST')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('shows only loading while the query is in flight', () => {
    renderStates({ entries: null })
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('No entries yet.')).not.toBeInTheDocument()
  })

  it('shows only the empty text for a resolved empty result', () => {
    renderStates({ entries: [] })
    expect(screen.getByText('No entries yet.')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('THE LIST')).not.toBeInTheDocument()
  })

  it('shows only the list when there are rows', () => {
    renderStates({ entries: [{ id: 1 }, { id: 2 }] })
    expect(screen.getByText('THE LIST')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('No entries yet.')).not.toBeInTheDocument()
  })

  it('never renders two states at once, whatever the inputs', () => {
    const cases: Array<{ error?: string | null; entries?: unknown[] | null }> = [
      { error: 'boom', entries: null },
      { error: 'boom', entries: [] },
      { error: 'boom', entries: [{ id: 1 }] },
      { entries: null },
      { entries: [] },
      { entries: [{ id: 1 }] },
    ]
    for (const c of cases) {
      const { unmount } = renderStates(c)
      const shown = [
        screen.queryByRole('alert'),
        screen.queryByText('Loading...'),
        screen.queryByText('No entries yet.'),
        screen.queryByText('THE LIST'),
      ].filter(Boolean)
      expect(shown, JSON.stringify(c)).toHaveLength(1)
      unmount()
    }
  })
})

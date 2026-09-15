import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import SaveFailureBanner from './SaveFailureBanner'
import { recordSaveFailure, failures, gaps, resetSaveFailures } from '../../store/save-failure-store'

describe('SaveFailureBanner', () => {
  beforeEach(() => {
    resetSaveFailures()
    localStorage.clear()
  })

  it('renders nothing when there are no failures', () => {
    const { container } = render(() => <SaveFailureBanner />)
    expect(container.textContent).toBe('')
  })

  it('shows the lost set and its error, and announces as an alert', async () => {
    render(() => <SaveFailureBanner />)
    recordSaveFailure({
      sessionId: 1, describe: 'Main set 3 · 255lb × 8', message: 'quota exceeded',
      retry: async () => {},
    })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Main set 3 · 255lb × 8')).toBeInTheDocument()
    expect(screen.getByText('quota exceeded')).toBeInTheDocument()
  })

  it('stays put — nothing auto-dismisses it', async () => {
    vi.useFakeTimers()
    try {
      render(() => <SaveFailureBanner />)
      recordSaveFailure({ sessionId: 1, describe: 'set', message: 'boom' })
      await Promise.resolve()
      vi.advanceTimersByTime(60_000)
      expect(screen.getByRole('alert')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a successful retry clears the banner and the persisted gap', async () => {
    const retry = vi.fn(async () => {})
    render(() => <SaveFailureBanner />)
    recordSaveFailure({ sessionId: 1, describe: 'Main set 3', message: 'boom', retry })

    fireEvent.click(await screen.findByRole('button', { name: 'RETRY' }))
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(gaps()).toHaveLength(0)
  })

  it('a failed retry leaves the banner up', async () => {
    const retry = vi.fn(async () => { throw new Error('still down') })
    render(() => <SaveFailureBanner />)
    recordSaveFailure({ sessionId: 1, describe: 'Main set 3', message: 'boom', retry })

    fireEvent.click(await screen.findByRole('button', { name: 'RETRY' }))
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(failures()).toHaveLength(1)
  })

  it('offers no retry button for a failure with no retry closure (post-reload)', async () => {
    render(() => <SaveFailureBanner />)
    recordSaveFailure({ sessionId: 1, describe: 'Main set 3', message: 'boom' })
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'RETRY' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dismiss unsaved/ })).toBeInTheDocument()
  })

  it('dismiss drops the entry without retrying', async () => {
    const retry = vi.fn(async () => {})
    render(() => <SaveFailureBanner />)
    recordSaveFailure({ sessionId: 1, describe: 'Main set 3', message: 'boom', retry })

    fireEvent.click(await screen.findByRole('button', { name: /^Dismiss unsaved/ }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(retry).not.toHaveBeenCalled()
    expect(gaps()).toHaveLength(0)
  })

  it('lists every outstanding failure', async () => {
    render(() => <SaveFailureBanner />)
    recordSaveFailure({ sessionId: 1, describe: 'Main set 1', message: 'boom' })
    recordSaveFailure({ sessionId: 1, describe: 'Main set 2', message: 'boom' })
    await screen.findByText('Main set 1')
    expect(screen.getByText('Main set 2')).toBeInTheDocument()
    expect(screen.getAllByText('Not saved')).toHaveLength(2)
  })

  // ── F51 ───────────────────────────────────────────────────────────────────
  // `retrying` was a single `number | null` tracking in-flight state for a LIST,
  // so it got two things wrong at once: retrying B re-enabled A's button while
  // A's write was still in flight, and whichever settled first cleared the
  // marker for both. The retry closure re-attempts the original write, so a
  // duplicate accepted retry writes the set twice — on the one path whose whole
  // purpose is recovering a set that was already lost once.
  describe('concurrent retries', () => {
    function deferred() {
      let release!: () => void
      const parked = new Promise<void>(r => { release = r })
      return { fn: vi.fn(() => parked), release: () => release() }
    }

    it('keeps each failure disabled independently while in flight (F51)', async () => {
      const a = deferred()
      const b = deferred()
      recordSaveFailure({ sessionId: 1, describe: 'set A', message: 'boom', retry: a.fn })
      recordSaveFailure({ sessionId: 1, describe: 'set B', message: 'boom', retry: b.fn })
      render(() => <SaveFailureBanner />)

      const buttons = () => screen.getAllByRole('button', { name: /RETRY/i })
      fireEvent.click(buttons()[0])
      await waitFor(() => expect(buttons()[0]).toBeDisabled())
      fireEvent.click(buttons()[1])
      await waitFor(() => expect(buttons()[1]).toBeDisabled())

      // A's write is still in flight, so A must stay disabled.
      expect(buttons()[0]).toBeDisabled()
      a.release(); b.release()
    })

    it('does not re-run a retry that is already in flight (F51)', async () => {
      const a = deferred()
      const b = deferred()
      recordSaveFailure({ sessionId: 1, describe: 'set A', message: 'boom', retry: a.fn })
      recordSaveFailure({ sessionId: 1, describe: 'set B', message: 'boom', retry: b.fn })
      render(() => <SaveFailureBanner />)

      const buttons = () => screen.getAllByRole('button', { name: /RETRY/i })
      fireEvent.click(buttons()[0])
      await waitFor(() => expect(buttons()[0]).toBeDisabled())
      fireEvent.click(buttons()[1])
      await waitFor(() => expect(buttons()[1]).toBeDisabled())
      // Third tap on A: under one shared slot A had been re-enabled by B.
      fireEvent.click(buttons()[0])

      expect(a.fn).toHaveBeenCalledTimes(1)
      a.release(); b.release()
    })

    it("one retry settling does not clear another's in-flight marker (F51)", async () => {
      const a = deferred()
      const b = deferred()
      recordSaveFailure({ sessionId: 1, describe: 'set A', message: 'boom', retry: a.fn })
      recordSaveFailure({ sessionId: 1, describe: 'set B', message: 'boom', retry: b.fn })
      render(() => <SaveFailureBanner />)

      const buttons = () => screen.getAllByRole('button', { name: /RETRY/i })
      fireEvent.click(buttons()[0])
      await waitFor(() => expect(buttons()[0]).toBeDisabled())
      fireEvent.click(buttons()[1])
      await waitFor(() => expect(buttons()[1]).toBeDisabled())

      a.release()
      await waitFor(() => expect(screen.queryByText('set A')).not.toBeInTheDocument())
      // B is still pending; its button must still be disabled.
      expect(screen.getAllByRole('button', { name: /RETRY/i })[0]).toBeDisabled()
      b.release()
    })
  })

})

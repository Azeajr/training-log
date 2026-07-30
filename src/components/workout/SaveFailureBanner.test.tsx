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
})

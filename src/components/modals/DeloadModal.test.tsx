import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import * as cycle from '../../lib/cycle'
import DeloadModal from './DeloadModal'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const plan = (weight: number): cycle.DeloadPlan => ({
  cycleId: 1,
  changes: [{ liftId: 1, liftName: 'Bench', oldWeight: 200, weight }],
  alreadyCut: [],
  tooLight: [],
})

afterEach(() => vi.restoreAllMocks())

describe('DeloadModal preview', () => {
  it('blocks confirmation during loading and ignores an older percentage that resolves last', async () => {
    const first = deferred<cycle.DeloadPlan>()
    const second = deferred<cycle.DeloadPlan>()
    vi.spyOn(cycle, 'planDeload').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const apply = vi.spyOn(cycle, 'applyDeload').mockResolvedValue(plan(170).changes)
    const complete = vi.fn()
    render(() => <DeloadModal onCancel={() => {}} onComplete={complete} />)

    expect(screen.getByRole('button', { name: 'CONFIRM DELOAD −10%' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Increase deload percent' }))
    const confirm = screen.getByRole('button', { name: 'CONFIRM DELOAD −15%' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(apply).not.toHaveBeenCalled()

    second.resolve(plan(170))
    await screen.findByText('Bench: 200 → 170 lb')
    first.resolve(plan(180))
    await first.promise
    expect(screen.queryByText('Bench: 200 → 180 lb')).not.toBeInTheDocument()
    fireEvent.click(confirm)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(apply).toHaveBeenCalledWith(expect.anything(), plan(170))
  })

  it('shows a failed preview and keeps confirmation disabled', async () => {
    vi.spyOn(cycle, 'planDeload').mockRejectedValue(new Error('Read failed'))
    const apply = vi.spyOn(cycle, 'applyDeload')
    const cancel = vi.fn()
    render(() => <DeloadModal onCancel={cancel} onComplete={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load training maxes')
    expect(screen.getByRole('button', { name: 'CONFIRM DELOAD −10%' })).toBeDisabled()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})

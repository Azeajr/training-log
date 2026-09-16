// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { db } from '../../db/index'
import { __resetForTest } from '../../db/sqlite-client'
import RecordsPanel from './RecordsPanel'

// The per-lift read is mocked so a test can control WHICH request settles first.
// That is the whole point of F63: the panel published whatever landed last
// rather than whatever was asked for last.
const pending = new Map<number, () => void>()
let delayed: Set<number> = new Set()

vi.mock('../../lib/performance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/performance')>()
  return {
    ...actual,
    baselineWorkingSets: vi.fn(async (_db: unknown, liftId: number) => {
      const sets = [{
        id: liftId, sessionId: 1, type: 'main', setNumber: 1,
        weight: liftId === 1 ? 111 : 222, reps: 5, isAmrap: false,
      }]
      if (delayed.has(liftId)) {
        await new Promise<void>(resolve => pending.set(liftId, resolve))
      }
      return sets
    }),
  }
})

beforeEach(async () => {
  await __resetForTest()
  pending.clear()
  delayed = new Set()
  await db.lifts.bulkAdd([
    { id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' },
    { id: 2, name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
  ] as never)
})

describe('RecordsPanel request identity (F63)', () => {
  it('does not let a superseded load overwrite the current lift', async () => {
    const [liftId, setLiftId] = createSignal(1)
    delayed.add(1) // lift 1's read parks until released

    render(() => <RecordsPanel liftId={liftId()} compact />)
    // Switch before lift 1 lands. History.tsx passes a live signal here, so
    // this is the ordinary path, not an edge case.
    setLiftId(2)
    await waitFor(() => expect(document.body.textContent).toContain('222'))

    // Now let the stale request finish. It must not publish.
    await waitFor(() => expect(pending.has(1)).toBe(true))
    pending.get(1)!()
    await new Promise(r => setTimeout(r, 30))

    expect(document.body.textContent).toContain('222')
    expect(document.body.textContent).not.toContain('111')
  })

  it('re-enters the loading state when the lift changes', async () => {
    const [liftId, setLiftId] = createSignal(1)
    render(() => <RecordsPanel liftId={liftId()} compact />)
    await waitFor(() => expect(document.body.textContent).toContain('111'))

    delayed.add(2)
    setLiftId(2)
    // setLoading(false) was never undone, so a switch showed the PREVIOUS
    // lift's numbers with no indication anything was happening.
    await waitFor(() => expect(screen.getByText(/Loading/i)).toBeInTheDocument())
    expect(document.body.textContent).not.toContain('111')

    // setLoading(true) is synchronous, so Loading appears before the read is
    // even called — wait for the read to actually park before releasing it.
    await waitFor(() => expect(pending.has(2)).toBe(true))
    pending.get(2)!()
    await waitFor(() => expect(document.body.textContent).toContain('222'))
  })
})

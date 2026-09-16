// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { db } from '../../db/index'
import { __resetForTest } from '../../db/sqlite-client'
import LiftSetupModal from './LiftSetupModal'

beforeEach(async () => { await __resetForTest() })

// ── F49 ─────────────────────────────────────────────────────────────────────
// The modal rendered fully interactive before load() resolved, and load() then
// wrote over whatever the user had touched: plateMode and implementBase are
// seeded with defaults ('paired', settings.barWeight) at setup, and for an
// existing lift load() replaces them after an awaited query. Tapping NONE
// before the query settled showed `none`, then flipped back to `paired` on its
// own. The same await also means a lift stored as `none` displays the WRONG
// equipment mode until load() lands.
describe('LiftSetupModal load race (F49)', () => {
  const seedLift = () =>
    db.lifts.add({
      name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95,
      liftType: 'upper', plateMode: 'none',
    } as never)

  it('does not accept edits to equipment before the stored values arrive', async () => {
    const liftId = await seedLift()
    render(() => <LiftSetupModal liftId={liftId} onCommit={() => {}} onCancel={() => {}} />)

    // Before load settles the displayed mode is a default, not this lift's.
    // Nothing here may be edited into, or load() will silently undo it.
    const chips = screen.getAllByRole('button', { name: /PER SIDE|TOTAL|NONE/i })
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) expect(chip).toBeDisabled()
  })

  it('shows the stored equipment mode once loaded, and is editable then', async () => {
    const liftId = await seedLift()
    render(() => <LiftSetupModal liftId={liftId} onCommit={() => {}} onCancel={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^NONE$/i })).not.toBeDisabled()
    })
    // Stored as 'none', so the base-weight stepper is withheld.
    expect(screen.queryByText('base lb')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^PER SIDE$/i }))
    await waitFor(() => expect(screen.getByText('base lb')).toBeInTheDocument())
  })

  it('does not revert a choice made after loading', async () => {
    const liftId = await seedLift()
    render(() => <LiftSetupModal liftId={liftId} onCommit={() => {}} onCancel={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^NONE$/i })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /^TOTAL$/i }))
    await new Promise(r => setTimeout(r, 30))
    expect(screen.getByText('base lb')).toBeInTheDocument()
  })
})

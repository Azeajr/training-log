import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@solidjs/testing-library'
import { db } from '../../src/db/db'
import Settings from './Settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0))
  }
})

describe('Settings', () => {
  it('shows theme section', async () => {
    render(() => <Settings />)
    expect(await screen.findByText(/THEME/i)).toBeInTheDocument()
  })

  it('shows default bar weight (45)', async () => {
    render(() => <Settings />)
    expect(await screen.findByText('45')).toBeInTheDocument()
  })

  it('shows plate config section', async () => {
    render(() => <Settings />)
    expect(await screen.findByText(/PLATES/i)).toBeInTheDocument()
  })

  it('shows lift TM value from DB', async () => {
    await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: 1, weight: 155, setAt: new Date() })
    render(() => <Settings />)
    expect(await screen.findByText(/155/)).toBeInTheDocument()
  })

  it('TRAINING MAXES section shows seeded lift TM', async () => {
    await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    render(() => <Settings />)
    // wait for TM to load (proves lifts + tms signals are both set)
    await screen.findByText(/200/)
    // lift name appears in TM section and exercises section
    expect(screen.getAllByText('OHP').length).toBeGreaterThan(0)
  })

  it('EXPORT JSON button triggers file download', async () => {
    let capturedBlob: Blob | undefined
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((b: Blob) => { capturedBlob = b; return 'mock-url' }),
      revokeObjectURL: vi.fn(),
    })
    render(() => <Settings />)
    const exportBtn = await screen.findByRole('button', { name: /EXPORT JSON/i })
    fireEvent.click(exportBtn)
    await waitFor(() => { expect(capturedBlob).toBeDefined() })
    vi.unstubAllGlobals()
  })

  it('EXPORT CSV button triggers file download', async () => {
    let capturedBlob: Blob | undefined
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((b: Blob) => { capturedBlob = b; return 'mock-url' }),
      revokeObjectURL: vi.fn(),
    })
    render(() => <Settings />)
    const exportBtn = await screen.findByRole('button', { name: /EXPORT CSV/i })
    fireEvent.click(exportBtn)
    await waitFor(() => { expect(capturedBlob).toBeDefined() })
    vi.unstubAllGlobals()
  })

  it('IMPORT JSON shows confirm dialog on file selection', async () => {
    render(() => <Settings />)
    await screen.findByRole('button', { name: /IMPORT JSON/i })
    // simulate file input change directly (can't click hidden input via fireEvent in jsdom)
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(['{"lifts":[]}'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file], writable: false })
    fireEvent.change(fileInput)
    expect(await screen.findByText(/OVERWRITE ALL DATA/i)).toBeInTheDocument()
  })
})

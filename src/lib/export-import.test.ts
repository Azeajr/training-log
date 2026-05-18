// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { TrainingDB } from '../db/db'
import { retryPendingExport, exportJson, importFromRawData, exportCsv, importJson } from './export-import'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any
let capturedBlob: Blob | null = null

const PENDING_KEY = 'pending-export'

beforeEach(async () => {
  db = new TrainingDB()
  capturedBlob = null
  localStorage.clear()
  ;(globalThis as any).URL.createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob
    return 'blob:test'
  })
  ;(globalThis as any).URL.revokeObjectURL = vi.fn()
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement
    }
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement
  })
})

afterEach(async () => {
  await db.delete()
  vi.restoreAllMocks()
  localStorage.clear()
})

async function seedBase() {
  await db.lifts.bulkAdd([
    { id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' },
  ])
  await db.trainingMaxes.add({ liftId: 1, weight: 100, setAt: new Date('2026-01-01') })
  return db.cycles.add({ number: 1, startDate: new Date('2026-01-01'), endDate: null })
}

// ─── retryPendingExport ───────────────────────────────────────────────────────

describe('retryPendingExport', () => {
  it('does nothing when no pending export in localStorage', async () => {
    await retryPendingExport()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('triggers download and removes localStorage entry', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ content: '{"test":1}', filename: 'test.json' }))
    await retryPendingExport()
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('clears corrupt localStorage entry without throwing', async () => {
    localStorage.setItem(PENDING_KEY, 'not-valid-json{{{')
    await retryPendingExport()
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })
})

// ─── importFromRawData ────────────────────────────────────────────────────────

describe('importFromRawData', () => {
  it('clears all tables before importing', async () => {
    await seedBase()
    await importFromRawData(db, {
      lifts: [], trainingMaxes: [], cycles: [], sessions: [],
      sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    expect(await db.lifts.count()).toBe(0)
    expect(await db.trainingMaxes.count()).toBe(0)
    expect(await db.cycles.count()).toBe(0)
  })

  it('imports lifts with explicit ids intact', async () => {
    await importFromRawData(db, {
      lifts: [
        { id: 1, name: 'OHP',   order: 1, progressionIncrement: 5, baseWeight: 95,  liftType: 'upper' },
        { id: 2, name: 'Bench', order: 2, progressionIncrement: 5, baseWeight: 95,  liftType: 'upper' },
      ],
      trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [], liftAccessories: [], settings: [],
    })
    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(2)
    expect(lifts.find((l: { id?: number }) => l.id === 1)?.name).toBe('OHP')
    expect(lifts.find((l: { id?: number }) => l.id === 2)?.name).toBe('Bench')
  })

  it('parses date strings in trainingMaxes', async () => {
    await importFromRawData(db, {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [{ id: 1, liftId: 1, weight: 100, setAt: '2026-01-15T00:00:00.000Z' }],
      cycles: [], sessions: [], sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    const tms = await db.trainingMaxes.toArray()
    expect(tms[0].setAt).toBeInstanceOf(Date)
    expect(tms[0].setAt.getFullYear()).toBe(2026)
  })

  it('handles optional accessoryTrainingMaxes + accessorySets when keys present', async () => {
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.accessoryTrainingMaxes.add({ exerciseId: exId, weight: 50, incrementLb: 5, setAt: new Date() })
    await importFromRawData(db, {
      lifts: [], trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [], liftAccessories: [], settings: [],
      accessoryTrainingMaxes: [],
      accessorySets: [],
    })
    expect(await db.accessoryTrainingMaxes.count()).toBe(0)
    expect(await db.accessorySets.count()).toBe(0)
  })

  it('leaves accessoryTrainingMaxes untouched when key absent from payload', async () => {
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.accessoryTrainingMaxes.add({ exerciseId: exId, weight: 50, incrementLb: 5, setAt: new Date() })
    await importFromRawData(db, {
      lifts: [], trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [], liftAccessories: [], settings: [],
    })
    expect(await db.accessoryTrainingMaxes.count()).toBe(1)
  })

  it('imports sessions with parsed date', async () => {
    await importFromRawData(db, {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [],
      cycles: [{ id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null }],
      sessions: [{ id: 1, cycleId: 1, liftId: 1, week: 1, date: '2026-01-06T00:00:00.000Z', notes: null, status: 'completed' }],
      sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].date).toBeInstanceOf(Date)
  })
})

// ─── exportJson ───────────────────────────────────────────────────────────────

describe('exportJson', () => {
  it('collects all DB tables into version-1 JSON and triggers download', async () => {
    await seedBase()
    await exportJson(db)
    expect(capturedBlob).not.toBeNull()
    const text = await capturedBlob!.text()
    const parsed = JSON.parse(text)
    expect(parsed.version).toBe(1)
    expect(parsed.lifts).toHaveLength(1)
    expect(parsed.lifts[0].name).toBe('OHP')
    expect(parsed).toHaveProperty('exportedAt')
  })

  it('saves to localStorage when download throws', async () => {
    await seedBase()
    ;(globalThis as any).URL.createObjectURL = vi.fn(() => { throw new Error('unavailable') })
    await exportJson(db)
    const pending = localStorage.getItem(PENDING_KEY)
    expect(pending).not.toBeNull()
    const { content, filename } = JSON.parse(pending!)
    expect(JSON.parse(content).version).toBe(1)
    expect(filename).toMatch(/training-log-\d{4}-\d{2}-\d{2}\.json/)
  })
})

// ─── exportCsv ────────────────────────────────────────────────────────────────

describe('exportCsv', () => {
  it('produces header row plus one row per completed set', async () => {
    const cycleId = await seedBase()
    const sessionId = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    await exportCsv(db)
    const text = await capturedBlob!.text()
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('date')
    expect(lines[1]).toContain('OHP')
    expect(lines[1]).toContain('2026-01-06')
  })

  it('skips pending sessions', async () => {
    const cycleId = await seedBase()
    await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'pending',
    })
    await exportCsv(db)
    const text = await capturedBlob!.text()
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(1) // header only
  })

  it('includes accessory sets in CSV output', async () => {
    const cycleId = await seedBase()
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const sessionId = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed',
    })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await exportCsv(db)
    const text = await capturedBlob!.text()
    expect(text).toContain('Chinup')
    expect(text).toContain('accessory')
  })

  it('includes a row with no sets when session has empty sets', async () => {
    const cycleId = await seedBase()
    await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: 'rest day', status: 'completed',
    })
    await exportCsv(db)
    const text = await capturedBlob!.text()
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(2) // header + 1 row
    expect(lines[1]).toContain('rest day')
  })
})

// ─── importFromRawData — full payload (covers all bulkAdd branches) ───────────

describe('importFromRawData — full payload', () => {
  it('imports all table types including sets, exercises, liftAccessories, settings, accessoryTrainingMaxes, accessorySets', async () => {
    await importFromRawData(db, {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [{ id: 1, liftId: 1, weight: 100, setAt: '2026-01-01T00:00:00.000Z' }],
      cycles: [{ id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null }],
      sessions: [{ id: 1, cycleId: 1, liftId: 1, week: 1, date: '2026-01-06T00:00:00.000Z', notes: null, status: 'completed' }],
      sets: [{ id: 1, sessionId: 1, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false }],
      exercises: [{ id: 1, name: 'Chinup', type: 'reps' }],
      liftAccessories: [{ id: 1, liftId: 1, exerciseId: 1, order: 0 }],
      settings: [{ id: 1, restTimer1: 90, restTimer2: 180, restTimerFail: 300, theme: 'dark', barWeight: 45, plates: [] }],
      accessoryTrainingMaxes: [{ id: 1, exerciseId: 1, weight: 50, incrementLb: 5, setAt: '2026-01-01T00:00:00.000Z' }],
      accessorySets: [{ id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null }],
    })

    expect(await db.lifts.count()).toBe(1)
    expect(await db.sets.count()).toBe(1)
    expect(await db.exercises.count()).toBe(1)
    expect(await db.liftAccessories.count()).toBe(1)
    expect(await db.settings.count()).toBe(1)
    expect(await db.accessoryTrainingMaxes.count()).toBe(1)
    expect(await db.accessorySets.count()).toBe(1)

    const atm = await db.accessoryTrainingMaxes.toArray()
    expect(atm[0].setAt).toBeInstanceOf(Date)
  })
})

// ─── importJson ───────────────────────────────────────────────────────────────

describe('importJson', () => {
  it('reads File object and imports data into DB', async () => {
    const payload = {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [], liftAccessories: [], settings: [],
    }
    const file = new File([JSON.stringify(payload)], 'export.json', { type: 'application/json' })
    await importJson(db, file)
    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(1)
    expect(lifts[0].name).toBe('OHP')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db/db'
import { importFromRawData, exportJson, exportCsv, importJson, retryPendingExport } from './exportImport'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('importFromRawData', () => {
  it('preserves explicit IDs so FK references stay valid after import', async () => {
    // Simulate lifts already existing (ids 1-4) before import, as seedDatabase creates them.
    // This replicates the bug scenario: clear() leaves sqlite_sequence at 4, then
    // bulkAdd with explicit ids 1-4 must not get reassigned to 5-8.
    await db.lifts.bulkAdd([
      { id: 1, name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { id: 2, name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
      { id: 3, name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { id: 4, name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
    ])

    await importFromRawData({
      lifts: [
        { id: 1, name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
        { id: 2, name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
        { id: 3, name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
        { id: 4, name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
      ],
      trainingMaxes: [
        { id: 8, liftId: 1, weight: 80,  setAt: '2026-03-23T04:00:00.000Z' },
        { id: 9, liftId: 3, weight: 105, setAt: '2026-03-25T04:00:00.000Z' },
      ],
      cycles: [
        { id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null },
      ],
      sessions: [
        { id: 1, cycleId: 1, liftId: 1, week: 1, date: '2026-01-06T00:00:00.000Z', notes: null, status: 'completed' },
        { id: 2, cycleId: 1, liftId: 3, week: 1, date: '2026-01-07T00:00:00.000Z', notes: null, status: 'completed' },
      ],
      sets: [
        { id: 1, sessionId: 1, type: 'main', setNumber: 1, weight: 55, reps: 5, isAmrap: false },
        { id: 2, sessionId: 2, type: 'main', setNumber: 1, weight: 75, reps: 5, isAmrap: false },
      ],
      exercises: [],
      liftAccessories: [],
      accessoryTrainingMaxes: [],
      accessorySets: [],
      settings: [],
    })

    const lifts = await db.lifts.toArray()
    const liftById = Object.fromEntries(lifts.map(l => [l.id!, l.name]))
    expect(liftById[1]).toBe('OHP')
    expect(liftById[4]).toBe('Squat')

    // trainingMaxes FK: liftId must resolve to a real lift
    const tms = await db.trainingMaxes.toArray()
    expect(tms).toHaveLength(2)
    for (const tm of tms) {
      expect(liftById[tm.liftId]).toBeDefined()
    }

    // sets FK: sessionId must resolve to a real session
    const sessions = await db.sessions.toArray()
    const sessionIds = new Set(sessions.map(s => s.id!))
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(2)
    for (const s of sets) {
      expect(sessionIds.has(s.sessionId)).toBe(true)
    }
  })

  it('restores custom barWeight and plates from settings', async () => {
    const plates = [{ weight: 45, count: 6 }, { weight: 25, count: 4 }]
    await importFromRawData({
      lifts: [], trainingMaxes: [], accessoryTrainingMaxes: [],
      cycles: [], sessions: [], sets: [], exercises: [],
      liftAccessories: [], accessorySets: [],
      settings: [{ id: 1, restTimer1: 90, restTimer2: 180, restTimerFail: 300, barWeight: 35, plates }],
    })

    const [row] = await db.settings.toArray()
    expect(row.barWeight).toBe(35)
    expect(row.plates).toEqual(plates)
  })

  it('replaces all existing data on import', async () => {
    await db.lifts.bulkAdd([
      { id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' },
    ])
    await db.trainingMaxes.add({ liftId: 1, weight: 999, setAt: new Date() })

    await importFromRawData({
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [],
      cycles: [], sessions: [], sets: [], exercises: [],
      liftAccessories: [], accessoryTrainingMaxes: [], accessorySets: [], settings: [],
    })

    expect(await db.trainingMaxes.count()).toBe(0)
  })

  it('imports non-empty exercises and liftAccessories', async () => {
    await importFromRawData({
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [{ id: 1, name: 'Chinup', type: 'reps' }],
      liftAccessories: [{ id: 1, liftId: 1, exerciseId: 1, order: 0 }],
      accessoryTrainingMaxes: [], accessorySets: [], settings: [],
    })
    expect(await db.exercises.count()).toBe(1)
    expect(await db.liftAccessories.count()).toBe(1)
  })

  it('imports old-format data without accessory keys (no clear for missing keys)', async () => {
    // Old backups lack accessoryTrainingMaxes and accessorySets keys.
    // The import should NOT clear those tables when the key is absent.
    await db.accessoryTrainingMaxes.add({ exerciseId: 1, weight: 50, incrementLb: 2.5, setAt: new Date() })
    const before = await db.accessoryTrainingMaxes.count()

    await importFromRawData({
      lifts: [], trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [], liftAccessories: [], settings: [],
      // Note: no accessoryTrainingMaxes or accessorySets keys → old format
    } as Parameters<typeof importFromRawData>[0])

    // Table was NOT cleared (old format = preserve existing accessory data)
    expect(await db.accessoryTrainingMaxes.count()).toBe(before)
  })

  it('imports non-empty accessoryTrainingMaxes and accessorySets', async () => {
    await importFromRawData({
      lifts: [], trainingMaxes: [], cycles: [],
      sessions: [{ id: 1, cycleId: 0, liftId: 1, week: 1, date: '2026-01-01T00:00:00.000Z', notes: null, status: 'completed' }],
      sets: [], exercises: [], liftAccessories: [], settings: [],
      accessoryTrainingMaxes: [{ id: 1, exerciseId: 1, weight: 50, incrementLb: 2.5, setAt: '2026-01-01T00:00:00.000Z' }],
      accessorySets: [{ id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null }],
    })
    expect(await db.accessoryTrainingMaxes.count()).toBe(1)
    expect(await db.accessorySets.count()).toBe(1)
  })
})

describe('exportJson', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom doesn't implement URL.createObjectURL — force the localStorage fallback
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => { throw new Error('not implemented') }, revokeObjectURL: () => {} })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('includes barWeight and plates in exported settings', async () => {
    const plates = [{ weight: 45, count: 4 }, { weight: 25, count: 4 }]
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300, barWeight: 35, plates })

    await exportJson()

    const pending = localStorage.getItem('pending-export')
    expect(pending).not.toBeNull()
    const { content } = JSON.parse(pending!) as { content: string }
    const data = JSON.parse(content)
    expect(data.settings).toHaveLength(1)
    expect(data.settings[0].barWeight).toBe(35)
    expect(data.settings[0].plates).toEqual(plates)
  })

  it('round-trip preserves custom plate configuration', async () => {
    const plates = [{ weight: 45, count: 6 }, { weight: 10, count: 2 }]
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300, barWeight: 55, plates })

    await exportJson()

    const { content } = JSON.parse(localStorage.getItem('pending-export')!) as { content: string }
    const exported = JSON.parse(content)

    await db.delete()
    await db.open()
    localStorage.clear()

    await importFromRawData(exported)

    const [row] = await db.settings.toArray()
    expect(row.barWeight).toBe(55)
    expect(row.plates).toEqual(plates)
  })
})

// V(G)=5 (session loop × has-sets branch × completed filter); paths P1..P8
describe('exportCsv', () => {
  let capturedBlob: Blob | undefined

  beforeEach(() => {
    capturedBlob = undefined
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((b: Blob) => { capturedBlob = b; return 'mock-url' }),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  async function seedLiftAndSession(opts: { status?: 'completed' | 'pending'; week?: 1|2|3|4; notes?: string; date?: Date } = {}) {
    const liftId = await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: opts.week ?? 1,
      date: opts.date ?? new Date('2026-03-15T00:00:00.000Z'),
      notes: opts.notes ?? null,
      status: opts.status ?? 'completed',
    })
    return { liftId, cycleId, sessionId }
  }

  it('P1: emits correct header row', async () => { // structure
    await exportCsv()

    const csv = await capturedBlob!.text()
    const header = csv.split('\n')[0]
    expect(header).toBe('"date","lift","week","type","set_number","weight_lb","reps","is_amrap","session_notes","exercise_name"')
  })

  it('P2: only includes completed sessions — TF branch (pending excluded)', async () => {
    await seedLiftAndSession({ status: 'pending' })

    await exportCsv()

    const csv = await capturedBlob!.text()
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1) // header only
  })

  it('P3: formats date as YYYY-MM-DD', async () => {
    const { sessionId } = await seedLiftAndSession({ date: new Date('2026-03-15T00:00:00.000Z') })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"2026-03-15"')
  })

  it('P4: includes all set types in rows — BVA: max iterations', async () => {
    const { sessionId } = await seedLiftAndSession()
    await db.sets.bulkAdd([
      { sessionId, type: 'warmup', setNumber: 1, weight: 50,  reps: 5, isAmrap: false },
      { sessionId, type: 'main',   setNumber: 1, weight: 100, reps: 5, isAmrap: false },
      { sessionId, type: 'fsl',    setNumber: 1, weight: 65,  reps: 10, isAmrap: false },
      { sessionId, type: 'joker',  setNumber: 1, weight: 110, reps: 3, isAmrap: false },
    ])

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"warmup"')
    expect(csv).toContain('"main"')
    expect(csv).toContain('"fsl"')
    expect(csv).toContain('"joker"')
  })

  it('P5: session with no sets emits one row with empty fields — BVA: 0-iter inner loop', async () => {
    await seedLiftAndSession()
    // no sets added

    await exportCsv()

    const csv = await capturedBlob!.text()
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(2) // header + 1 data row
    expect(lines[1]).toContain('"OHP"')
    expect(lines[1]).toContain('""') // empty type field
  })

  it('P6: escapes double-quotes in session notes', async () => {
    const { sessionId } = await seedLiftAndSession({ notes: 'PR "attempt"' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"PR ""attempt"""')
  })

  it('P7: maps liftId to lift name — liftMap lookup', async () => {
    const { sessionId } = await seedLiftAndSession()
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"OHP"')
  })

  it('P8: empty DB produces only header row — BVA: 0-iter outer loop', async () => { // no lifts or sessions
    await exportCsv()

    const csv = await capturedBlob!.text()
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
  })

  it('P9: AMRAP set exports is_amrap=true', async () => {
    const { sessionId } = await seedLiftAndSession()
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 130, reps: 8, isAmrap: true })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"true"') // isAmrap=true branch covered
  })

  it('P10: liftId without matching lift uses numeric fallback', async () => {
    // Add a session whose liftId has no corresponding lift in the lifts table
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId: 999, week: 1,
      date: new Date('2026-03-15T00:00:00.000Z'),
      notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"999"') // liftMap fallback: String(session.liftId)
  })

  it('P11: accessory set with weight/reps and exercise name in CSV', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1,
      date: new Date('2026-03-15T00:00:00.000Z'),
      notes: 'great', status: 'completed',
    })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"Chinup"')   // exerciseMap lookup
    expect(csv).toContain('"50"')        // weight != null → String
    expect(csv).toContain('"8"')         // reps != null → String
    expect(csv).toContain('"great"')     // session.notes present
  })

  it('P12: accessory set with null weight/reps and unknown exerciseId fallback', async () => {
    const liftId = await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1,
      date: new Date('2026-03-15T00:00:00.000Z'),
      notes: null, status: 'completed',
    })
    // exerciseId 999 has no exercise in DB → exerciseMap[999] is undefined → String(999)
    await db.accessorySets.add({ sessionId, exerciseId: 999, setNumber: 1, weight: null, reps: null, duration: 60, distance: null })

    await exportCsv()

    const csv = await capturedBlob!.text()
    expect(csv).toContain('"999"') // exerciseMap fallback
    // weight and reps are null → empty strings
    const lines = csv.split('\n').filter(Boolean)
    const accessoryRow = lines[1]
    expect(accessoryRow).toContain('""') // empty weight and reps fields
  })
})

// V(G)=2 (file.text → JSON.parse); paths P1..P3
describe('importJson', () => {
  it('P1: parses valid JSON File and populates DB via importFromRawData', async () => {
    const data = {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [], accessoryTrainingMaxes: [], cycles: [], sessions: [],
      sets: [], exercises: [], liftAccessories: [], accessorySets: [], settings: [],
    }
    const file = new File([JSON.stringify(data)], 'export.json', { type: 'application/json' })

    await importJson(file)

    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(1)
    expect(lifts[0].name).toBe('OHP')
  })

  it('P2: round-trip — exportJson localStorage fallback → importJson restores DB', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => { throw new Error('not implemented') }, revokeObjectURL: () => {} })
    await db.lifts.add({ name: 'Bench', order: 3, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await exportJson()
    const { content } = JSON.parse(localStorage.getItem('pending-export')!) as { content: string }

    await db.delete()
    await db.open()
    vi.unstubAllGlobals()

    const file = new File([content], 'export.json', { type: 'application/json' })
    await importJson(file)

    const lifts = await db.lifts.toArray()
    expect(lifts[0].name).toBe('Bench')
  })

  it('P3: throws on invalid JSON — SyntaxError propagates', async () => {
    const file = new File(['not json {{{'], 'bad.json', { type: 'application/json' })

    await expect(importJson(file)).rejects.toThrow(SyntaxError)
  })
})

// V(G)=3 (has-pending × is-valid-json); paths P1..P4
describe('retryPendingExport', () => {
  let capturedBlob: Blob | undefined

  beforeEach(() => {
    capturedBlob = undefined
    localStorage.clear()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((b: Blob) => { capturedBlob = b; return 'mock-url' }),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('P1: does nothing when no pending export — FF branch', async () => {
    await retryPendingExport()

    expect(capturedBlob).toBeUndefined()
    expect(localStorage.getItem('pending-export')).toBeNull()
  })

  it('P2: triggers download and removes localStorage entry for valid pending export — TT branch', async () => {
    localStorage.setItem('pending-export', JSON.stringify({ content: '{"data":1}', filename: 'export.json' }))

    await retryPendingExport()

    expect(capturedBlob).toBeDefined()
    const text = await capturedBlob!.text()
    expect(text).toBe('{"data":1}')
    expect(localStorage.getItem('pending-export')).toBeNull()
  })

  it('P3: clears corrupt JSON entry silently — catch block', async () => {
    localStorage.setItem('pending-export', 'NOT VALID JSON {{{')

    await retryPendingExport()

    expect(capturedBlob).toBeUndefined()
    expect(localStorage.getItem('pending-export')).toBeNull()
  })

  it('P4: clears entry with missing filename field — partial valid JSON falls into catch', async () => {
    // triggerDownload will throw if filename is not a string (a.download = undefined)
    // but JSON.parse succeeds, so the try body runs but download may behave oddly.
    // The key invariant: the key must be removed regardless.
    localStorage.setItem('pending-export', JSON.stringify({ content: 'hello' })) // no filename

    await retryPendingExport()

    // download attempted (blob captured) and key removed
    expect(localStorage.getItem('pending-export')).toBeNull()
  })
})

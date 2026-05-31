// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import { retryPendingExport, exportJson, importFromRawData, exportCsv, importJson, MAX_IMPORT_BYTES } from './export-import'

let capturedBlob: Blob | null = null

const PENDING_KEY = 'pending-export'

beforeEach(async () => {
  await __resetForTest()
  capturedBlob = null
  localStorage.clear()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).URL.createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob
    return 'blob:test'
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).URL.revokeObjectURL = vi.fn()
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement
    }
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement
  })
})

afterEach(async () => {
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
    expect(capturedBlob!.type).toBe('application/json')
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

  it('clears accessoryTrainingMaxes even when key absent from payload', async () => {
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.accessoryTrainingMaxes.add({ exerciseId: exId, weight: 50, incrementLb: 5, setAt: new Date() })
    await importFromRawData(db, {
      lifts: [], trainingMaxes: [], cycles: [], sessions: [], sets: [],
      exercises: [], liftAccessories: [], settings: [],
    })
    expect(await db.accessoryTrainingMaxes.count()).toBe(0)
  })

  it('imports sessions with parsed date', async () => {
    await importFromRawData(db, {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [],
      cycles: [{ id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null }],
      sessions: [{ id: 1, cycleId: 1, liftId: 1, week: 1, date: '2026-01-06T00:00:00.000Z', notes: null, status: 'completed' }],
      sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    expect(await db.cycles.count()).toBe(1)
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].date).toBeInstanceOf(Date)
  })

  it('strips unknown columns from lifts (e.g. supplementalTemplate from legacy export)', async () => {
    await importFromRawData(db, {
      lifts: [
        { id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper', supplementalTemplate: 'fsl' },
      ],
      trainingMaxes: [], cycles: [], sessions: [], sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(1)
    expect(lifts[0].name).toBe('OHP')
  })

  it('parses date strings in cycles including endDate', async () => {
    await importFromRawData(db, {
      lifts: [],
      trainingMaxes: [],
      cycles: [{ id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-04-01T00:00:00.000Z' }],
      sessions: [], sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    const cycles = await db.cycles.toArray()
    expect(cycles[0].startDate).toBeInstanceOf(Date)
    expect(cycles[0].endDate).toBeInstanceOf(Date)
    expect((cycles[0].endDate as Date).getFullYear()).toBe(2026)
  })

})

// ─── exportJson ───────────────────────────────────────────────────────────────

describe('exportJson', () => {
  it('collects all DB tables into version-1 JSON and triggers download', async () => {
    await seedBase()
    await exportJson(db)
    expect(capturedBlob).not.toBeNull()
    expect(capturedBlob!.type).toBe('application/json')
    const text = await capturedBlob!.text()
    const parsed = JSON.parse(text)
    expect(parsed.version).toBe(2)
    expect(parsed.lifts).toHaveLength(1)
    expect(parsed.lifts[0].name).toBe('OHP')
    expect(parsed).toHaveProperty('exportedAt')
  })

  it('saves to localStorage when download throws', async () => {
    await seedBase()
    ;(globalThis.URL as { createObjectURL: unknown }).createObjectURL = vi.fn(() => { throw new Error('unavailable') })
    await exportJson(db)
    const pending = localStorage.getItem(PENDING_KEY)
    expect(pending).not.toBeNull()
    const { content, filename } = JSON.parse(pending!)
    expect(JSON.parse(content).version).toBe(2)
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

  it('zero-sets session with null notes writes empty notes field', async () => {
    const cycleId = await seedBase()
    await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed',
    })
    await exportCsv(db)
    const lines = (await capturedBlob!.text()).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1].split(',')[8]).toBe('""') // notes ?? '' → empty
  })

  it('liftId not in liftMap uses numeric fallback; isAmrap=true writes "true"; null notes uses empty fallback', async () => {
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId: 999, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 130, reps: 8, isAmrap: true })
    await exportCsv(db)
    const text = await capturedBlob!.text()
    expect(text).toContain('"999"')   // liftMap[999] ?? '999'
    expect(text).toContain('"true"')  // isAmrap=true
    expect(text.trim().split('\n')[1].split(',')[8]).toBe('""') // notes ?? ''
  })

  it('CSV header contains all 10 expected column names exactly (kills StringLiteral mutants on L135)', async () => {
    const cycleId = await seedBase()
    await db.sessions.add({ cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' })
    await exportCsv(db)
    const header = (await capturedBlob!.text()).split('\n')[0]
    for (const col of ['date', 'lift', 'week', 'type', 'set_number', 'weight_lb', 'reps', 'is_amrap', 'session_notes', 'exercise_name']) {
      expect(header).toContain(`"${col}"`)
    }
  })

  it('no-sets completed session row has empty type, set_number, weight, reps, is_amrap, exercise_name (kills L146 StringLiteral mutants)', async () => {
    const cycleId = await seedBase()
    await db.sessions.add({ cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' })
    await exportCsv(db)
    const cols = (await capturedBlob!.text()).trim().split('\n')[1].split(',')
    expect(cols[3]).toBe('""')  // type
    expect(cols[4]).toBe('""')  // set_number
    expect(cols[5]).toBe('""')  // weight_lb
    expect(cols[6]).toBe('""')  // reps
    expect(cols[7]).toBe('""')  // is_amrap
    expect(cols[9]).toBe('""')  // exercise_name
  })

  it('CSV assigns each set to its own session — filter removes cross-session sets (kills L140-L141 filter mutants)', async () => {
    const cycleId = await seedBase()
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const s1 = await db.sessions.add({ cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' })
    const s2 = await db.sessions.add({ cycleId, liftId: 1, week: 2, date: new Date('2026-01-13'), notes: null, status: 'completed' })
    await db.sets.add({ sessionId: s1, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId: s2, type: 'main', setNumber: 1, weight: 105, reps: 5, isAmrap: false })
    await db.accessorySets.add({ sessionId: s1, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await exportCsv(db)
    const text = await capturedBlob!.text()
    const lines = text.trim().split('\n')
    // 1 header + 1 main set (s1) + 1 accessory (s1) + 1 main set (s2) = 4 lines
    // With unfiltered sets: each session would accumulate all sets → more rows
    expect(lines).toHaveLength(4)
  })

  it('accessory non-null weight and reps write exact values in CSV (kills L151 col 66 String mutant)', async () => {
    const cycleId = await seedBase()
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const sessionId = await db.sessions.add({ cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 75, reps: 12, duration: null, distance: null })
    await exportCsv(db)
    const cols = (await capturedBlob!.text()).trim().split('\n')[1].split(',')
    expect(cols[5]).toBe('"75"')   // weight exact, not ""
    expect(cols[6]).toBe('"12"')   // reps exact, not ""
  })

  it('accessory set with null weight, null reps, and unknown exerciseId uses fallbacks', async () => {
    const cycleId = await seedBase()
    const sessionId = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed',
    })
    await db.accessorySets.add({
      sessionId, exerciseId: 999, setNumber: 1, weight: null, reps: null, duration: 60, distance: null,
    })
    await exportCsv(db)
    const cols = (await capturedBlob!.text()).trim().split('\n')[1].split(',')
    expect(cols[5]).toBe('""')    // weight null → ''
    expect(cols[6]).toBe('""')    // reps null → ''
    expect(cols[9]).toBe('"999"') // exerciseMap[999] ?? '999'
  })
})

// ─── importFromRawData — optional keys & parseDates precision ────────────────

describe('importFromRawData — mutation precision', () => {
  it('handles completely absent optional keys without throwing (kills optional-chaining → true mutants)', async () => {
    // All keys except lifts omitted — with `d.trainingMaxes?.length → d.trainingMaxes.length`
    // and `if (true)` mutants, calling pickCols/bulkAdd on undefined would throw.
    await expect(importFromRawData(db, {
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
    })).resolves.toBeUndefined()
    expect(await db.lifts.count()).toBe(1)
    expect(await db.trainingMaxes.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
  })

  it('parseDates leaves null date fields as null (copy[f] != null guard is necessary)', async () => {
    // endDate=null: without the != null check, new Date(null) = epoch (1970-01-01), not null.
    await importFromRawData(db, {
      lifts: [], trainingMaxes: [],
      cycles: [{ id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null }],
      sessions: [], sets: [], exercises: [], liftAccessories: [], settings: [],
    })
    const cycles = await db.cycles.toArray()
    expect(cycles[0].startDate).toBeInstanceOf(Date)
    expect(cycles[0].endDate).toBeNull()
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
    expect(await db.trainingMaxes.count()).toBe(1)
    expect(await db.cycles.count()).toBe(1)
    expect(await db.sessions.count()).toBe(1)
    expect(await db.sets.count()).toBe(1)
    expect(await db.exercises.count()).toBe(1)
    expect(await db.liftAccessories.count()).toBe(1)
    expect(await db.settings.count()).toBe(1)
    expect(await db.accessoryTrainingMaxes.count()).toBe(1)
    expect(await db.accessorySets.count()).toBe(1)

    const cycles = await db.cycles.toArray()
    expect(cycles[0].startDate).toBeInstanceOf(Date)

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

  it('rejects files larger than the import cap before parsing', async () => {
    const oversize = new File(['x'], 'big.json', { type: 'application/json' })
    Object.defineProperty(oversize, 'size', { value: MAX_IMPORT_BYTES + 1 })
    await expect(importJson(db, oversize)).rejects.toThrow(/too large/)
  })

  it('rejects malformed JSON with a friendly error', async () => {
    const file = new File(['{not json'], 'broken.json', { type: 'application/json' })
    await expect(importJson(db, file)).rejects.toThrow(/Invalid JSON/)
  })

  it('rejects JSON arrays / scalars at top level', async () => {
    const file = new File(['[1,2,3]'], 'wrong-shape.json', { type: 'application/json' })
    await expect(importJson(db, file)).rejects.toThrow(/expected JSON object/)
  })

  it('rejects scalar number at top level (kills typeof !== object → false mutant)', async () => {
    const file = new File(['42'], 'scalar.json', { type: 'application/json' })
    await expect(importJson(db, file)).rejects.toThrow(/expected JSON object/)
  })

  it('accepts file of exactly MAX_IMPORT_BYTES (boundary: > not >=)', async () => {
    const payload = JSON.stringify({ lifts: [], trainingMaxes: [], cycles: [], sessions: [], sets: [], exercises: [], liftAccessories: [], settings: [] })
    const file = new File([payload], 'ok.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES })
    await expect(importJson(db, file)).resolves.toBeUndefined()
  })

  it('error message includes the actual file size and the limit in MB', async () => {
    const over = new File(['x'], 'big.json', { type: 'application/json' })
    Object.defineProperty(over, 'size', { value: MAX_IMPORT_BYTES + 1 })
    const actualMb = ((MAX_IMPORT_BYTES + 1) / 1024 / 1024).toFixed(1)
    const limitMb = String(MAX_IMPORT_BYTES / 1024 / 1024)
    await expect(importJson(db, over)).rejects.toThrow(actualMb)
    await expect(importJson(db, over)).rejects.toThrow(limitMb)
  })

  it('silently strips malicious / unknown columns from imported rows', async () => {
    // pickCols at the import boundary is the friendly defense — unknown keys
    // (whether from a legacy export or a hostile file) are dropped before
    // they ever reach bulkAdd / the INSERT column list. The strict defense
    // (assertIdent throwing) is exercised in db/sqlite-table.test.ts.
    const payload = {
      lifts: [],
      trainingMaxes: [],
      cycles: [],
      sessions: [],
      sets: [{
        'id"; DROP TABLE sets; --': 1,
        sessionId: 1,
        type: 'main',
        setNumber: 1,
        weight: 100,
        reps: 5,
        isAmrap: false,
      }],
      exercises: [],
      liftAccessories: [],
      settings: [],
    }
    const file = new File([JSON.stringify(payload)], 'attack.json', { type: 'application/json' })
    await importJson(db, file)
    // Table still exists (no DROP ran) and the legitimate columns persisted.
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(1)
    expect(sets[0].weight).toBe(100)
  })
})

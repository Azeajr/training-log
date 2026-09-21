import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'
import { ptCheckActuals } from '../lib/pt'

beforeEach(async () => { await __resetForTest() })

const ACTUAL_COLUMNS = [
  'reps', 'seconds', 'distance', 'distanceUnit',
  'weight', 'band', 'equipmentHeight', 'equipmentHeightUnit',
] as const

describe('per-set actuals migration', () => {
  it('leaves a tick-only row readable and lets a new row record what was done', async () => {
    const raw = (sql: string) => db.ptSetChecks._query(sql, [])
    for (const column of ACTUAL_COLUMNS) {
      await raw(`ALTER TABLE ptSetChecks DROP COLUMN ${column}`)
    }

    // A run recorded before PT stored anything but a tick.
    const legacyId = await db.ptSetChecks.add({ sessionId: 1, ptExerciseId: 1, setNumber: 1, done: true })

    const migrations = ADDITIVE_MIGRATIONS.filter(sql => sql.startsWith('ALTER TABLE ptSetChecks ADD COLUMN'))
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const sql of migrations) {
        try { await raw(sql) } catch { /* Already applied, as on app startup. */ }
      }
    }

    const legacy = (await db.ptSetChecks.get(legacyId))!
    expect(legacy).toMatchObject({ done: true, setNumber: 1 })
    for (const column of ACTUAL_COLUMNS) expect(legacy[column]).toBeNull()

    // All-null is the one thing that means "fall back to the prescription".
    expect(ptCheckActuals(legacy, {
      measure: 'reps', targetReps: 12, targetSeconds: null, targetDistance: null, distanceUnit: null,
      resistanceKind: 'band', resistanceWeight: null, resistanceBand: 'red',
      equipmentHeight: null, equipmentHeightUnit: null,
    })).toMatchObject({ reps: 12, band: 'red' })

    const recordedId = await db.ptSetChecks.add({
      sessionId: 1, ptExerciseId: 1, setNumber: 2, done: true,
      reps: 8, seconds: null, distance: null, distanceUnit: null,
      weight: 10, band: null, equipmentHeight: 12, equipmentHeightUnit: 'cm',
    })
    expect(await db.ptSetChecks.get(recordedId)).toMatchObject({
      reps: 8, weight: 10, equipmentHeight: 12, equipmentHeightUnit: 'cm',
    })
  })

  /**
   * The kinds arrive on a database that already holds runs. Those rows keep the
   * gap — NULL, not today's routine — and are read from the values they stored.
   */
  it('adds the kind columns to an existing database without touching its rows', async () => {
    const raw = (sql: string) => db.ptSetChecks._query(sql, [])
    for (const column of ['measure', 'resistanceKind']) {
      await raw(`ALTER TABLE ptSetChecks DROP COLUMN ${column}`)
    }

    // A run recorded after actuals existed but before the kinds did.
    const id = await db.ptSetChecks.add({
      sessionId: 1, ptExerciseId: 1, setNumber: 1, done: true,
      reps: 8, weight: 25, recorded: true,
    })

    const migrations = ADDITIVE_MIGRATIONS.filter(sql => sql.startsWith('ALTER TABLE ptSetChecks ADD COLUMN'))
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const sql of migrations) {
        try { await raw(sql) } catch { /* Already applied, as on app startup. */ }
      }
    }

    const row = (await db.ptSetChecks.get(id))!
    expect(row).toMatchObject({ reps: 8, weight: 25, recorded: true })
    expect(row.measure).toBeNull()
    expect(row.resistanceKind).toBeNull()

    // Read under a routine that has since gone bodyweight and started counting
    // time: the row's own values still say what it was.
    expect(ptCheckActuals(row, {
      measure: 'time', targetReps: null, targetSeconds: 30, targetDistance: null, distanceUnit: null,
      resistanceKind: 'none', resistanceWeight: null, resistanceBand: null,
      equipmentHeight: null, equipmentHeightUnit: null,
    })).toMatchObject({ reps: 8, weight: 25 })
  })

  it('still rejects two rows for the same set of the same exercise', async () => {
    await db.ptSetChecks.add({ sessionId: 1, ptExerciseId: 1, setNumber: 1, done: true, reps: 10 })
    await expect(
      db.ptSetChecks.add({ sessionId: 1, ptExerciseId: 1, setNumber: 1, done: false, reps: 3 }),
    ).rejects.toThrow()
  })
})

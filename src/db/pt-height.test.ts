import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'

beforeEach(async () => { await __resetForTest() })

describe('optional PT equipment height migration', () => {
  it('preserves existing exercises and allows height to be added after migration and retry', async () => {
    const raw = (sql: string) => db.ptExercises._query(sql, [])
    await raw('ALTER TABLE ptExercises DROP COLUMN equipmentHeight')
    await raw('ALTER TABLE ptExercises DROP COLUMN equipmentHeightUnit')
    const id = await db.ptExercises.add({
      routineId: 1, name: 'Step down', sets: 3, measure: 'reps', targetReps: 10,
      resistanceKind: 'weight', resistanceWeight: 10, order: 0,
    })
    const migrations = ADDITIVE_MIGRATIONS.filter(sql => sql.startsWith('ALTER TABLE ptExercises ADD COLUMN equipmentHeight'))
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const sql of migrations) {
        try { await raw(sql) } catch { /* Already applied, as on app startup. */ }
      }
    }
    expect(await db.ptExercises.get(id)).toMatchObject({
      name: 'Step down', sets: 3, targetReps: 10, resistanceWeight: 10,
      equipmentHeight: null, equipmentHeightUnit: null,
    })
    await db.ptExercises.update(id, { equipmentHeight: 6, equipmentHeightUnit: 'in' })
    expect(await db.ptExercises.get(id)).toMatchObject({ equipmentHeight: 6, equipmentHeightUnit: 'in' })
  })
})

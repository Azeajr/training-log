import { it, expect } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'

it('adds drop rounds without changing legacy sets, and safely repeats on startup', async () => {
  await __resetForTest()
  const raw = (sql: string) => db.accessorySets._query(sql, [])
  await raw('ALTER TABLE accessorySets DROP COLUMN dropRounds')
  const id = await db.accessorySets.add({ sessionId: 1, exerciseId: 1, setNumber: 1, weight: 100, reps: 10, duration: null, distance: null })
  const migration = ADDITIVE_MIGRATIONS.find(sql => sql.startsWith('ALTER TABLE accessorySets ADD COLUMN dropRounds'))!
  await raw(migration)
  await expect(raw(migration)).rejects.toThrow()
  expect(await db.accessorySets.get(id)).toMatchObject({ weight: 100, reps: 10, dropRounds: null })
  await db.accessorySets.update(id, { dropRounds: [{ weight: 80, reps: 8 }, { weight: 60, reps: 6 }] })
  expect((await db.accessorySets.get(id))?.dropRounds).toEqual([{ weight: 80, reps: 8 }, { weight: 60, reps: 6 }])
})

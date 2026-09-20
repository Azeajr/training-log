import { it, expect } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'
import { defaultBandProfile, makeBandLoad, seedBandProfiles } from '../lib/band-loading'
import { importFromRawData } from '../lib/export-import'

it('preserves legacy rows through additive migration, seeds independent profiles, and round-trips snapshots', async () => {
  await __resetForTest()
  const raw = (sql: string) => db.sets._query(sql, [])
  for (const table of ['sets', 'accessorySets']) await raw(`ALTER TABLE ${table} DROP COLUMN bandLoad`)
  for (const table of ['lifts', 'exercises']) await raw(`ALTER TABLE ${table} DROP COLUMN bandProfile`)
  const liftId = await db.lifts.add({ name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 145, liftType: 'upper' })
  const legacyId = await db.sets.add({ sessionId: 1, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: true })
  for (const sql of ADDITIVE_MIGRATIONS.filter(s => /ADD COLUMN band(Profile|Load)/.test(s))) {
    await raw(sql)
    await expect(raw(sql)).rejects.toThrow()
  }
  expect(await db.sets.get(legacyId)).toMatchObject({ weight: 100, reps: 5, bandLoad: null })
  await seedBandProfiles(db)
  const profile = defaultBandProfile('Chin-ups')!
  expect((await db.lifts.get(liftId))?.bandProfile).toEqual(profile)
  const bandLoad = makeBandLoad(profile, 'Green', 5)
  const id = await db.sets.add({ sessionId: 1, type: 'main', setNumber: 2, weight: 150, reps: 8, isAmrap: true, bandLoad })
  await db.accessorySets.add({ sessionId: 1, exerciseId: 1, setNumber: 1, weight: 150, reps: 8, duration: null, distance: null, bandLoad, dropRounds: [{ weight: 145, reps: 6, bandLoad: { ...bandLoad, addedWeight: 0 } }] })
  await db.lifts.update(liftId, { bandProfile: { ...profile, rawLoad: 220 } })
  await seedBandProfiles(db)
  expect((await db.lifts.get(liftId))?.bandProfile?.rawLoad).toBe(220)
  const backup = JSON.parse(JSON.stringify({ lifts: await db.lifts.toArray(), sets: await db.sets.toArray(), accessorySets: await db.accessorySets.toArray() }))
  await importFromRawData(db, backup)
  expect(await db.sets.get(id)).toMatchObject({ weight: 150, bandLoad })
  expect((await db.accessorySets.toArray())[0]).toMatchObject({ bandLoad, dropRounds: [{ bandLoad: { ...bandLoad, addedWeight: 0 } }] })
  await expect(importFromRawData(db, { sets: [{ bandLoad: { band: 'Green', addedWeight: -1 } }] })).rejects.toThrow('band load')
  expect((await db.sets.get(id))?.weight).toBe(150)
})

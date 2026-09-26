import { describe, it, expect } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { ADDITIVE_MIGRATIONS } from './schema'
import { DEFAULT_BANDS, bandProfileFor, clearSeededBandProfiles, defaultBandProfile, makeBandLoad, reconcileBandInventory, removeBand, renameBand, upgradeLegacyBandLoads } from '../lib/band-loading'
import type { BandLoad, BandProfile } from '../types/domain'
import { importFromRawData } from '../lib/export-import'

it('preserves legacy rows through additive migration, unseeds name-matched profiles, and round-trips snapshots', async () => {
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
  const profile = defaultBandProfile('Chin-ups')!
  // A profile byte-identical to the template is one the old boot seed wrote
  // without asking. It goes, and the lift logs a plain total again.
  await db.lifts.update(liftId, { bandProfile: profile })
  await clearSeededBandProfiles(db)
  expect((await db.lifts.get(liftId))?.bandProfile).toBeNull()
  expect(bandProfileFor({ name: 'Chin-ups', bandProfile: null })).toBeNull()
  const bandLoad = makeBandLoad(profile, ['Green'], 5)
  const id = await db.sets.add({ sessionId: 1, type: 'main', setNumber: 2, weight: 150, reps: 8, isAmrap: true, bandLoad })
  await db.accessorySets.add({ sessionId: 1, exerciseId: 1, setNumber: 1, weight: 150, reps: 8, duration: null, distance: null, bandLoad, dropRounds: [{ weight: 145, reps: 6, bandLoad: { ...bandLoad, addedWeight: 0 } }] })
  // ...and so is a profile it wrote under an EARLIER calibration. Correcting a
  // measurement must not strand databases seeded before the correction with
  // band loading still forced on, which is what matching only today's template
  // would do.
  const supersededBands = [
    { name: 'Orange', assistance: 104 }, { name: 'Green', assistance: 48 },
    { name: 'Purple', assistance: 31 }, { name: 'Red', assistance: 10 },
  ]
  const superseded = { ...profile, bands: supersededBands }
  expect(supersededBands).not.toEqual(profile.bands)
  await db.lifts.update(liftId, { bandProfile: superseded })
  await clearSeededBandProfiles(db)
  expect((await db.lifts.get(liftId))?.bandProfile).toBeNull()

  // Once the user has saved a calibration of their own it is theirs, whatever
  // the lift happens to be called. Same for one they deliberately turned off.
  await db.lifts.update(liftId, { bandProfile: { ...profile, rawLoad: 220 } })
  await clearSeededBandProfiles(db)
  expect((await db.lifts.get(liftId))?.bandProfile?.rawLoad).toBe(220)
  const exId = await db.exercises.add({ name: 'Pull-ups', type: 'reps', bandProfile: { ...defaultBandProfile('Pull-ups')!, enabled: false } })
  await clearSeededBandProfiles(db)
  expect((await db.exercises.get(exId))?.bandProfile?.enabled).toBe(false)
  const backup = JSON.parse(JSON.stringify({ lifts: await db.lifts.toArray(), sets: await db.sets.toArray(), accessorySets: await db.accessorySets.toArray() }))
  await importFromRawData(db, backup)
  expect(await db.sets.get(id)).toMatchObject({ weight: 150, bandLoad })
  expect((await db.accessorySets.toArray())[0]).toMatchObject({ bandLoad, dropRounds: [{ bandLoad: { ...bandLoad, addedWeight: 0 } }] })
  await expect(importFromRawData(db, { sets: [{ bandLoad: { bands: ['Green'], addedWeight: -1 } }] })).rejects.toThrow('band load')
  expect((await db.sets.get(id))?.weight).toBe(150)
})

// Bands stack now, so a load names a list of them. Rows from before name one,
// and they are rewritten wherever rows arrive rather than read in two shapes.
it('rewrites a pre-stacking band load once, and restores a pre-stacking backup in the current shape', async () => {
  await __resetForTest()
  const legacy = { band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0 } as unknown as BandLoad
  const id = await db.sets.add({ sessionId: 1, type: 'main', setNumber: 1, weight: 143, reps: 5, isAmrap: false, bandLoad: legacy })
  const plainId = await db.sets.add({ sessionId: 1, type: 'main', setNumber: 2, weight: 100, reps: 5, isAmrap: false })

  await upgradeLegacyBandLoads(db)
  const upgraded = await db.sets.get(id)
  expect(upgraded?.bandLoad).toEqual({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
  expect(await db.sets.get(plainId)).toMatchObject({ weight: 100 })
  // A second pass has nothing left to do.
  await upgradeLegacyBandLoads(db)
  expect(await db.sets.get(id)).toEqual(upgraded)

  const backup = {
    sets: [{ id: 7, sessionId: 1, type: 'main', setNumber: 1, weight: 143, reps: 5, isAmrap: false, bandLoad: legacy }],
    accessorySets: [{ id: 3, sessionId: 1, exerciseId: 1, setNumber: 1, weight: 143, reps: 8, duration: null, distance: null,
      bandLoad: { ...legacy, band: null }, dropRounds: [{ weight: 143, reps: 6, bandLoad: legacy }] }],
  }
  await importFromRawData(db, JSON.parse(JSON.stringify(backup)))
  expect((await db.sets.get(7))?.bandLoad).toEqual({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
  const acc = await db.accessorySets.get(3)
  expect(acc?.bandLoad).toEqual({ bands: [], rawLoad: 191, assistance: 48, addedWeight: 0 })
  expect(acc?.dropRounds?.[0].bandLoad).toEqual({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
  // A malformed legacy load is still refused, not waved through by the upgrade.
  await expect(importFromRawData(db, { sets: [{ id: 1, bandLoad: { ...legacy, band: 7 } }] })).rejects.toThrow('band load')
})

// The inventory is equipment, and the one list of band names. Profiles only
// measure the bands on it.
describe('the band inventory', () => {
  const settingsRow = { restTimer1: 90, restTimer2: 180, restTimerFail: 300 }
  const inventory = async () => (await db.settings.toCollection().first())?.bands
  const profile = (names: string[]): BandProfile => ({
    enabled: true, accepted: true, rawLoad: 191, maxAddedWeight: null,
    bands: names.map((name, i) => ({ name, assistance: 10 * (i + 1) })),
  })

  it('is built from the bands existing profiles measure, one of each, first met first', async () => {
    await __resetForTest()
    await db.settings.add(settingsRow)
    await db.lifts.add({ name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 0, liftType: 'upper', bandProfile: profile(['Orange', 'Olive']) })
    await db.exercises.add({ name: 'Nordic curls', type: 'reps', bandProfile: profile(['Olive', 'Blue']) })
    await db.exercises.add({ name: 'Curl', type: 'reps' })

    await reconcileBandInventory(db)
    expect(await inventory()).toEqual([{ name: 'Orange', count: 1 }, { name: 'Olive', count: 1 }, { name: 'Blue', count: 1 }])
    // Once there, it is the user's: nothing is re-derived over it.
    await db.settings.update((await db.settings.toCollection().first())!.id!, { bands: [{ name: 'Orange', count: 2 }, { name: 'Olive', count: 0 }, { name: 'Blue', count: 1 }] })
    await reconcileBandInventory(db)
    expect((await inventory())?.map(b => b.count)).toEqual([2, 0, 1])
  })

  it('starts at the default four when nothing is measured yet', async () => {
    await __resetForTest()
    await db.settings.add(settingsRow)
    await reconcileBandInventory(db)
    expect(await inventory()).toEqual(DEFAULT_BANDS)
  })

  it('adds a band a profile measures and the inventory lacks, leaving the rest', async () => {
    await __resetForTest()
    await db.settings.add({ ...settingsRow, bands: [{ name: 'Orange', count: 2 }] })
    await db.exercises.add({ name: 'Nordic curls', type: 'reps', bandProfile: profile(['Orange', 'Blue']) })
    await reconcileBandInventory(db)
    expect(await inventory()).toEqual([{ name: 'Orange', count: 2 }, { name: 'Blue', count: 1 }])
  })

  it('renames a band in the equipment and in every profile at once, and leaves logged sets alone', async () => {
    await __resetForTest()
    await db.settings.add({ ...settingsRow, bands: [{ name: 'Green', count: 2 }, { name: 'Red', count: 1 }] })
    const liftId = await db.lifts.add({ name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 0, liftType: 'upper', bandProfile: profile(['Green', 'Red']) })
    const exId = await db.exercises.add({ name: 'Nordic curls', type: 'reps', bandProfile: profile(['Red']) })
    const logged = makeBandLoad(profile(['Green', 'Red']), ['Green'])
    const setId = await db.sets.add({ sessionId: 1, type: 'main', setNumber: 1, weight: 181, reps: 5, isAmrap: false, bandLoad: logged })

    await renameBand(db, 'Green', '  Olive ')
    expect(await inventory()).toEqual([{ name: 'Olive', count: 2 }, { name: 'Red', count: 1 }])
    expect((await db.lifts.get(liftId))?.bandProfile?.bands).toEqual([{ name: 'Olive', assistance: 10 }, { name: 'Red', assistance: 20 }])
    expect((await db.exercises.get(exId))?.bandProfile?.bands).toEqual([{ name: 'Red', assistance: 10 }])
    expect((await db.sets.get(setId))?.bandLoad).toEqual(logged)

    await expect(renameBand(db, 'Olive', 'red')).rejects.toThrow(/cannot share/)
    await expect(renameBand(db, 'Olive', ' ')).rejects.toThrow(/needs a name/)
    await expect(renameBand(db, 'Blue', 'Navy')).rejects.toThrow(/No band called Blue/)
    // A refused rename changed nothing anywhere.
    expect((await inventory())?.map(b => b.name)).toEqual(['Olive', 'Red'])
    expect((await db.lifts.get(liftId))?.bandProfile?.bands.map(b => b.name)).toEqual(['Olive', 'Red'])
  })

  it('removes a band from the equipment and from every profile', async () => {
    await __resetForTest()
    await db.settings.add({ ...settingsRow, bands: [{ name: 'Green', count: 1 }, { name: 'Red', count: 1 }] })
    const liftId = await db.lifts.add({ name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 0, liftType: 'upper', bandProfile: profile(['Green', 'Red']) })
    await removeBand(db, 'Green')
    expect(await inventory()).toEqual([{ name: 'Red', count: 1 }])
    expect((await db.lifts.get(liftId))?.bandProfile?.bands).toEqual([{ name: 'Red', assistance: 20 }])
  })

  it('restores a backup\'s inventory, fills in one from before it existed, and refuses a bad one', async () => {
    await __resetForTest()
    const chin = { id: 1, name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 0, liftType: 'upper', bandProfile: profile(['Orange', 'Olive']) }
    await importFromRawData(db, { settings: [{ id: 1, ...settingsRow, bands: [{ name: 'Olive', count: 2 }] }], lifts: [chin] })
    expect(await inventory()).toEqual([{ name: 'Olive', count: 2 }, { name: 'Orange', count: 1 }])

    await importFromRawData(db, { settings: [{ id: 1, ...settingsRow }], lifts: [chin] })
    expect(await inventory()).toEqual([{ name: 'Orange', count: 1 }, { name: 'Olive', count: 1 }])

    await expect(importFromRawData(db, { settings: [{ id: 1, ...settingsRow, bands: [{ name: 'Olive', count: -1 }] }] }))
      .rejects.toThrow('band inventory')
  })
})

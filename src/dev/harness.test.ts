// @vitest-environment jsdom
import { vi, describe, it, expect } from 'vitest'

// Fresh in-process SQLite per test: vi.resetModules() gives the aliased test
// client a new database, and every module imported after it shares that one.
async function freshContext() {
  vi.resetModules()
  const [harness, seed, client, store] = await Promise.all([
    import('./harness'),
    import('../db/seed'),
    import('../db/sqlite-client'),
    import('../store/workout-store'),
  ])
  await seed.seedDatabase()
  return { ...harness, sqliteClient: client.sqliteClient, workoutStore: store }
}

describe('harnessSnapshot', () => {
  it('rejects unknown sections before reading anything', async () => {
    const { harnessSnapshot } = await freshContext()
    const query = vi.fn()
    await expect(harnessSnapshot(['session', 'apiKey'], query)).rejects.toThrow(/apiKey/)
    expect(query).not.toHaveBeenCalled()
  })

  it('reports no session and no cycle on a fresh install, with the seeded lifts counted', async () => {
    const { harnessSnapshot } = await freshContext()
    const snapshot = await harnessSnapshot(['session', 'cycle', 'counts', 'pt'])
    expect(snapshot.session).toBeNull()
    expect(snapshot.cycle).toBeNull()
    expect(snapshot.counts).toEqual({ cycles: 0, sessions: 0, sets: 0, ptSessions: 0 })
    expect(snapshot.pt).toEqual({ routineId: null, startedAt: null, exercises: 0, setsDone: 0 })
  })

  it('summarises the current cycle with each lift\'s latest training max', async () => {
    const { harnessSnapshot, sqliteClient } = await freshContext()
    await sqliteClient.run(`INSERT INTO cycles (number, startDate) VALUES (1, '2026-09-01')`)
    await sqliteClient.run(`INSERT INTO trainingMaxes (liftId, weight, setAt) VALUES (1, 95, '2026-09-01'), (1, 100, '2026-09-20'), (2, 300, '2026-09-01')`)
    await sqliteClient.run(`INSERT INTO sessions (cycleId, liftId, week, date, status) VALUES (1, 1, 1, '2026-09-02', 'completed'), (1, 2, 1, '2026-09-03', 'pending')`)
    const { cycle } = await harnessSnapshot(['cycle'])
    expect(cycle).toMatchObject({
      id: 1,
      number: 1,
      completedSessions: 1,
      trainingMaxes: [
        { lift: 'OHP', weight: 100 },
        { lift: 'Deadlift', weight: 300 },
      ],
    })
  })

  it('summarises an in-progress session without exposing its rows', async () => {
    const { harnessSnapshot, workoutStore } = await freshContext()
    workoutStore.startSession({ id: 7, cycleId: 1, liftId: 2, week: 3, date: new Date(), notes: null, status: 'pending' })
    const { session } = await harnessSnapshot(['session'])
    expect(session).toEqual({
      id: 7, cycleId: 1, liftId: 2, week: 3, status: 'pending',
      loggedSets: 0, crossSets: 0, skippedSets: 0, currentSetIndex: 0,
      resting: false, restType: 'normal', accessories: 0,
    })
  })

  it('exposes settings that change the training math, and nothing else', async () => {
    const { harnessSnapshot } = await freshContext()
    const { settings } = await harnessSnapshot(['settings'])
    expect(Object.keys(settings as object).sort()).toEqual([
      'barWeight', 'crossLiftSupplemental', 'deloadSupplemental', 'hasDeloadWeek', 'highRepDiscount',
      'restTimerNotifications', 'restTimers', 'supplementalTemplate', 'theme',
    ])
  })

  it('only ever reads: every query is a SELECT, and the default path refuses anything else', async () => {
    const { harnessSnapshot, readOnlyQuery } = await freshContext()
    const seen: string[] = []
    await harnessSnapshot(['cycle', 'counts'], async (sql) => {
      seen.push(sql)
      return []
    })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((sql) => /^\s*select\b/i.test(sql))).toBe(true)
    expect(() => readOnlyQuery('DELETE FROM sessions')).toThrow(/only reads/)
    expect(() => readOnlyQuery('WITH x AS (SELECT 1) DELETE FROM sets')).toThrow(/only reads/)
  })

  it('installs a snapshot-only accessor on the given window', async () => {
    const { installHarnessAccessor } = await freshContext()
    const target = {} as Window & { __harness?: { snapshot: unknown } }
    installHarnessAccessor(target)
    expect(Object.keys(target.__harness ?? {})).toEqual(['snapshot'])
  })
})

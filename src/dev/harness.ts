import { workout } from '../store/workout-store'
import { ptRun } from '../store/pt-store'
import { settings } from '../store/settings-store'
import { sqliteClient } from '../db/sqlite-client'

/**
 * Read-only development accessor for the agent harness (`harness.config.mjs`
 * → `state.read`). An agent reads a bounded summary of what the app believes —
 * the in-progress session, the current cycle and its training maxes, the PT
 * run, and row counts — instead of reverse-engineering it from pixels.
 *
 * DEV builds only (main.tsx imports it behind `import.meta.env.DEV`), and the
 * production smoke fails if `__harness` reaches a bundle. Nothing here writes:
 * the only database access is SELECT through the same worker the app uses.
 */
export const HARNESS_SECTIONS = ['session', 'cycle', 'pt', 'settings', 'counts'] as const
export type HarnessSection = (typeof HARNESS_SECTIONS)[number]

type Row = Record<string, unknown>
export type Query = (sql: string) => Promise<Row[]>

export const readOnlyQuery: Query = (sql) => {
  if (!/^\s*select\b/i.test(sql)) throw new Error('The harness accessor only reads.')
  return sqliteClient.query<Row>(sql)
}

export async function harnessSnapshot(
  sections: readonly string[],
  query: Query = readOnlyQuery,
): Promise<Record<string, unknown>> {
  const unknown = sections.filter((section) => !(HARNESS_SECTIONS as readonly string[]).includes(section))
  if (unknown.length) throw new Error(`Unknown harness section(s): ${unknown.join(', ')}`)
  const out: Record<string, unknown> = {}

  if (sections.includes('session')) {
    const session = workout.activeSession
    out.session = session
      ? {
          id: session.id ?? null,
          cycleId: session.cycleId,
          liftId: session.liftId,
          week: session.week,
          status: session.status,
          loggedSets: workout.loggedSets.length,
          crossSets: workout.loggedCrossSets.length,
          skippedSets: workout.skippedSets.length,
          currentSetIndex: workout.currentSetIndex,
          resting: workout.isResting,
          restType: workout.restType,
          accessories: workout.activeAccessories.length,
        }
      : null
  }

  if (sections.includes('cycle')) {
    const [cycle] = await query('SELECT id, number, startDate, endDate FROM cycles ORDER BY id DESC LIMIT 1')
    if (!cycle) out.cycle = null
    else {
      const [done] = await query(
        `SELECT COUNT(*) AS completed FROM sessions WHERE cycleId = ${Number(cycle.id)} AND status = 'completed'`,
      )
      const trainingMaxes = await query(
        'SELECT l.name AS lift, tm.weight AS weight FROM trainingMaxes tm JOIN lifts l ON l.id = tm.liftId ' +
          'WHERE tm.id IN (SELECT MAX(id) FROM trainingMaxes GROUP BY liftId) ORDER BY l."order"',
      )
      out.cycle = { ...cycle, completedSessions: done?.completed ?? 0, trainingMaxes }
    }
  }

  if (sections.includes('pt')) {
    out.pt = {
      routineId: ptRun.routineId,
      startedAt: ptRun.startedAt,
      exercises: Object.keys(ptRun.sets).length,
      setsDone: Object.values(ptRun.sets).flat().filter((set) => set.done).length,
    }
  }

  if (sections.includes('settings')) {
    out.settings = {
      hasDeloadWeek: settings.hasDeloadWeek,
      supplementalTemplate: settings.supplementalTemplate,
      deloadSupplemental: settings.deloadSupplemental,
      highRepDiscount: settings.highRepDiscount,
      theme: settings.theme,
      barWeight: settings.barWeight,
      restTimers: [settings.restTimer1, settings.restTimer2, settings.restTimerFail],
      restTimerNotifications: settings.restTimerNotifications,
    }
  }

  if (sections.includes('counts')) {
    const [counts] = await query(
      'SELECT (SELECT COUNT(*) FROM cycles) AS cycles, (SELECT COUNT(*) FROM sessions) AS sessions, ' +
        '(SELECT COUNT(*) FROM sets) AS sets, (SELECT COUNT(*) FROM ptSessions) AS ptSessions',
    )
    out.counts = counts ?? null
  }

  return out
}

export function installHarnessAccessor(target: Window = window): void {
  ;(target as Window & { __harness?: unknown }).__harness = { snapshot: harnessSnapshot }
}

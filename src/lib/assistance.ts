import type { Exercise, ExerciseCategory, AssistanceSection } from '../types/domain'
import type { TrainingDB } from '../db/index'
import { accessoryWeight } from './calc'
import { getLatestAccessoryTms } from './training-max'

// Wendler assistance is organised into three slots per session: one push, one
// pull, and one legs/core (lower-body + midsection). The four exercise
// categories collapse onto these three sections — legs and core share the last
// slot. AssistanceSection is defined in domain.ts (beside ExerciseCategory) and
// re-exported here with the labels and mapping below.
export type { AssistanceSection }

// A live accessory either fills one of the three fixed section slots (exactly
// one exercise each, picking replaces) or is an unconstrained 'extra'.
export type AssistanceSlot = AssistanceSection | 'extra'

export const ASSISTANCE_SECTIONS: readonly AssistanceSection[] = ['push', 'pull', 'legs_core']

export const SECTION_LABEL: Record<AssistanceSection, string> = {
  push: 'PUSH',
  pull: 'PULL',
  legs_core: 'LEGS / CORE',
}

// The four taggable categories, with display labels, for exercise editors.
export const EXERCISE_CATEGORIES: readonly ExerciseCategory[] = ['push', 'pull', 'legs', 'core']

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
}

export const sectionForCategory = (category?: ExerciseCategory): AssistanceSection | null => {
  switch (category) {
    case 'push': return 'push'
    case 'pull': return 'pull'
    case 'legs':
    case 'core': return 'legs_core'
    default: return null
  }
}

// How many of a lift's most recent sessions seed the "used for this lift"
// suggestions. Keeps the top picks to your current rotation instead of dredging
// up something done once months ago.
export const ASSISTANCE_SUGGESTION_SESSIONS = 3

// Rank accessory exercises by how recently they were logged for a main lift.
// `sessionsNewestFirst` is that lift's sessions ordered newest→oldest; only the
// first `maxSessions` are considered. The returned map gives each accessory
// exercise its best (lowest) 0-based session index, i.e. 0 = used in the most
// recent session. Exercises never logged in that window are absent. Used to
// float prior picks above the alphabetical rest.
export const accessoryRecencyRanks = (
  sessionsNewestFirst: Array<{ id?: number }>,
  accSets: Array<{ sessionId: number; exerciseId: number }>,
  maxSessions: number = Infinity,
): Map<number, number> => {
  const recencyBySession = new Map(sessionsNewestFirst.slice(0, maxSessions).map((s, i) => [s.id, i]))
  const best = new Map<number, number>()
  for (const s of accSets) {
    const ri = recencyBySession.get(s.sessionId)
    if (ri == null) continue
    const cur = best.get(s.exerciseId)
    if (cur == null || ri < cur) best.set(s.exerciseId, ri)
  }
  return best
}

// Bucket items by their exercise's category into the three assistance sections,
// plus an `uncategorized` catch-all so untagged exercises stay reachable.
// Preserves input order within each bucket.
export const groupByAssistanceSection = <T extends { exercise: Exercise }>(
  items: T[],
): Record<AssistanceSection | 'uncategorized', T[]> => {
  const groups: Record<AssistanceSection | 'uncategorized', T[]> = {
    push: [],
    pull: [],
    legs_core: [],
    uncategorized: [],
  }
  for (const item of items) {
    const section = sectionForCategory(item.exercise.category)
    groups[section ?? 'uncategorized'].push(item)
  }
  return groups
}

// A lift's persisted picks, one per section. Seeds a fresh session's slots and
// is what the Today screen shows/edits before a session exists. Archived
// exercises are dropped — an archived pick has no business resurfacing.
export async function getAssistanceDefaults(
  db: TrainingDB,
  liftId: number,
): Promise<Partial<Record<AssistanceSection, { exerciseId: number; name: string }>>> {
  const rows = await db.assistanceDefaults.where('liftId').equals(liftId).toArray()
  if (rows.length === 0) return {}
  const exercises = await db.exercises.where('id').anyOf(rows.map(r => r.exerciseId)).toArray()
  const exById = new Map(exercises.map(e => [e.id!, e]))
  const out: Partial<Record<AssistanceSection, { exerciseId: number; name: string }>> = {}
  for (const r of rows) {
    const ex = exById.get(r.exerciseId)
    if (!ex || ex.archived) continue
    out[r.section] = { exerciseId: r.exerciseId, name: ex.name }
  }
  return out
}

// Sets (replaces) the lift's default pick for one section. Called both from
// the Today screen's picker and from an in-session swap — either one becomes
// the new default, per the "last pick wins" rule.
export async function setAssistanceDefault(
  db: TrainingDB,
  liftId: number,
  section: AssistanceSection,
  exerciseId: number,
): Promise<void> {
  await db.assistanceDefaults.put({ liftId, section, exerciseId })
}

export interface AssistanceDefaultPick {
  section: AssistanceSection
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
}

// Resolves a lift's default picks into ready-to-log accessories for a fresh
// session. Builds on getAssistanceDefaults (same row/exercise/archived filter)
// and layers on the training-max lookup. A pick with no accessory training max
// yet is skipped — same as picking it manually mid-session, it needs a TM
// before it can be logged.
export async function getAssistanceDefaultPicks(
  db: TrainingDB,
  liftId: number,
): Promise<AssistanceDefaultPick[]> {
  const defaults = await getAssistanceDefaults(db, liftId)
  const entries = Object.entries(defaults) as Array<[AssistanceSection, { exerciseId: number; name: string }]>
  if (entries.length === 0) return []
  const latestTm = await getLatestAccessoryTms(db, entries.map(([, d]) => d.exerciseId))

  const out: AssistanceDefaultPick[] = []
  for (const [section, d] of entries) {
    const tm = latestTm.get(d.exerciseId)
    if (tm == null) continue
    out.push({
      section,
      exerciseId: d.exerciseId,
      exerciseName: d.name,
      tm,
      calculatedWeight: accessoryWeight(tm),
    })
  }
  return out
}

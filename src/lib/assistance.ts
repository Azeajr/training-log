import type { Exercise, ExerciseCategory } from '../types/domain'

// Wendler assistance is organised into three slots per session: one push, one
// pull, and one legs/core (lower-body + midsection). The four exercise
// categories collapse onto these three sections — legs and core share the last
// slot.
export type AssistanceSection = 'push' | 'pull' | 'legs_core'

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

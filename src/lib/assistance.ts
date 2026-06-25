import type { Exercise, ExerciseCategory } from '../types/domain'

// Wendler assistance is organised into three slots per session: one push, one
// pull, and one single-leg/core. The four exercise categories collapse onto
// these three sections — single_leg and core share the last slot.
export type AssistanceSection = 'push' | 'pull' | 'single_leg_core'

// A live accessory either fills one of the three fixed section slots (exactly
// one exercise each, picking replaces) or is an unconstrained 'extra'.
export type AssistanceSlot = AssistanceSection | 'extra'

export const ASSISTANCE_SECTIONS: readonly AssistanceSection[] = ['push', 'pull', 'single_leg_core']

export const SECTION_LABEL: Record<AssistanceSection, string> = {
  push: 'PUSH',
  pull: 'PULL',
  single_leg_core: 'SINGLE-LEG / CORE',
}

// The four taggable categories, with display labels, for exercise editors.
export const EXERCISE_CATEGORIES: readonly ExerciseCategory[] = ['push', 'pull', 'single_leg', 'core']

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  single_leg: 'Single-leg',
  core: 'Core',
}

export const sectionForCategory = (category?: ExerciseCategory): AssistanceSection | null => {
  switch (category) {
    case 'push': return 'push'
    case 'pull': return 'pull'
    case 'single_leg':
    case 'core': return 'single_leg_core'
    default: return null
  }
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
    single_leg_core: [],
    uncategorized: [],
  }
  for (const item of items) {
    const section = sectionForCategory(item.exercise.category)
    groups[section ?? 'uncategorized'].push(item)
  }
  return groups
}

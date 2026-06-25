import { describe, it, expect } from 'vitest'
import type { Exercise } from '../types/domain'
import { sectionForCategory, groupByAssistanceSection } from './assistance'

const ex = (name: string, category?: Exercise['category']): { exercise: Exercise } => ({
  exercise: { name, type: 'reps', category },
})

describe('sectionForCategory', () => {
  it('maps push and pull to their own sections', () => {
    expect(sectionForCategory('push')).toBe('push')
    expect(sectionForCategory('pull')).toBe('pull')
  })

  it('merges single_leg and core into one section', () => {
    expect(sectionForCategory('single_leg')).toBe('single_leg_core')
    expect(sectionForCategory('core')).toBe('single_leg_core')
  })

  it('returns null for an untagged exercise', () => {
    expect(sectionForCategory(undefined)).toBeNull()
  })
})

describe('groupByAssistanceSection', () => {
  it('buckets items into push / pull / single_leg_core / uncategorized', () => {
    const groups = groupByAssistanceSection([
      ex('Dips', 'push'),
      ex('Chinups', 'pull'),
      ex('Bulgarian Split Squat', 'single_leg'),
      ex('Plank', 'core'),
      ex('Mystery'),
    ])
    expect(groups.push.map(i => i.exercise.name)).toEqual(['Dips'])
    expect(groups.pull.map(i => i.exercise.name)).toEqual(['Chinups'])
    expect(groups.single_leg_core.map(i => i.exercise.name)).toEqual(['Bulgarian Split Squat', 'Plank'])
    expect(groups.uncategorized.map(i => i.exercise.name)).toEqual(['Mystery'])
  })

  it('preserves input order within a bucket', () => {
    const groups = groupByAssistanceSection([ex('A', 'pull'), ex('B', 'pull'), ex('C', 'pull')])
    expect(groups.pull.map(i => i.exercise.name)).toEqual(['A', 'B', 'C'])
  })
})

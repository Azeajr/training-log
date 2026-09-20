import { it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import ExerciseSetsBlock from './ExerciseSetsBlock'

it('shows assisted weights and all drop rounds in history', () => {
  render(() => <ExerciseSetsBlock name="Pull-up" sets={[{ sessionId: 1, exerciseId: 1, setNumber: 1, weight: -30, reps: 10, duration: null, distance: null, dropRounds: [{ weight: -50, reps: 8 }] }]} />)
  expect(screen.getByText('-30')).toBeVisible()
  expect(screen.getByText('-50')).toBeVisible()
  expect(screen.getByText('Drop 1')).toBeVisible()
})

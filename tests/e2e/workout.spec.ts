import { test, expect } from './fixtures'
import {
  completeSetupWizard, startWorkout, logSet, getWorkoutState,
  advanceThroughWarmups, advanceToAmrap,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await completeSetupWizard(page)
})

test.describe('workout flow', () => {
  test('START WORKOUT navigates to workout screen', async ({ page }) => {
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await expect(page.getByRole('button', { name: 'COMPLETE SESSION' })).toBeVisible()
    await expect(page.getByText('WARM UP')).toBeVisible()
    await expect(page.getByText('MAIN')).toBeVisible()
  })

  test('active set shows weight and reps steppers and a LOG button', async ({ page }) => {
    await startWorkout(page)
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
    await expect(
      page.getByTestId('stepper-reps').getByRole('button', { name: '+' })
    ).toBeVisible()
  })

  test('logging a set starts the rest timer', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()
  })

  test('SKIP REST dismisses the timer', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await expect(page.getByRole('button', { name: 'SKIP REST' })).not.toBeVisible()
  })

  test('logged set appears as completed row', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)
    await expect(page.getByText('× 8')).toBeVisible()
    await expect(page.getByText('done')).toBeVisible()
  })
})

test.describe('session persistence across refresh', () => {
  test('workout screen survives a page reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.reload()
    await expect(page.getByRole('button', { name: 'COMPLETE SESSION' })).toBeVisible()
    await expect(page.getByText('WARM UP')).toBeVisible()
  })

  test('logged sets are still shown after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)
    await page.reload()
    await expect(page.getByText('× 8')).toBeVisible()
    await expect(page.getByText('done')).toBeVisible()
  })

  test('set index position is restored after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
    await page.reload()
    // Still on next set after reload — LOG button visible again
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
  })
})

test.describe('rest timer persistence across refresh', () => {
  test('rest timer is still running after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()
  })

  test('timer shows elapsed time from original start, not from reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)

    // Wait for timer to advance past zero (event-driven, no arbitrary sleep)
    await expect(page.getByTestId('rest-timer-display')).not.toHaveText('0:00')
    const restStartedAt = (await getWorkoutState(page))?.restStartedAt

    await page.reload()
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()

    // restStartedAt must be the same original timestamp (not reset on reload)
    expect((await getWorkoutState(page))?.restStartedAt).toBe(restStartedAt)

    // Timer should hydrate from worker and show >= 1 second elapsed
    await expect.poll(async () => {
      const text = await page.getByTestId('rest-timer-display').textContent() ?? ''
      const [, mm, ss] = text.match(/(\d+):(\d+)/) ?? []
      return parseInt(mm ?? '0') * 60 + parseInt(ss ?? '0')
    }).toBeGreaterThanOrEqual(1)
  })
})

test.describe('resume banner and abandon dialog', () => {
  test('Today shows resume banner when session is active', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await expect(page.getByRole('link', { name: /SESSION IN PROGRESS/ })).toBeVisible()
  })

  test('resume banner navigates to workout', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.getByRole('link', { name: /SESSION IN PROGRESS/ }).click()
    await expect(page.getByRole('button', { name: 'COMPLETE SESSION' })).toBeVisible()
  })

  test('starting a different lift shows abandon confirm dialog', async ({ page }) => {
    await startWorkout(page) // starts OHP (first lift)
    await page.goto('/today')
    await page.getByRole('button', { name: 'Deadlift' }).click()
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await expect(page.getByText('Abandon OHP session?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'YES' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CANCEL' })).toBeVisible()
  })

  test('cancel closes the abandon dialog without changing session', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.getByRole('button', { name: 'Deadlift' }).click()
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await page.getByRole('button', { name: 'CANCEL' }).click()
    await expect(page.getByText('Abandon OHP session?')).not.toBeVisible()
    // Original session still active
    await expect(page.getByRole('link', { name: /SESSION IN PROGRESS/ })).toBeVisible()
  })

  test('START WORKOUT for the same lift resumes without wiping logged sets', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)
    await page.getByRole('button', { name: 'SKIP REST' }).click()

    await page.goto('/today')
    await page.getByRole('button', { name: 'START WORKOUT' }).click()

    // Should be back on the workout screen with the logged set still there
    await expect(page.getByRole('button', { name: 'COMPLETE SESSION' })).toBeVisible()
    await expect(page.getByText('× 8')).toBeVisible()
    await expect(page.getByText('done')).toBeVisible()
  })
})

test.describe('joker sets', () => {
  test('joker button absent before AMRAP is logged', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await expect(page.getByRole('button', { name: '+ JOKER SET' })).not.toBeVisible()
  })

  test('joker button appears after AMRAP logged at minimum reps (week 1 = 5)', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)
    await expect(page.getByRole('button', { name: '+ JOKER SET' })).toBeVisible()
  })

  test('joker button absent when AMRAP logged below minimum (4 < 5)', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 4)
    await expect(page.getByRole('button', { name: '+ JOKER SET' })).not.toBeVisible()
  })

  test('joker button shows next weight — 80lb AMRAP → 85lb joker', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)
    await expect(page.getByRole('button', { name: '85lb' })).toBeVisible()
  })

  test('clicking joker button adds a JOKER SETS section with LOG button', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)
    await page.getByRole('button', { name: '+ JOKER SET' }).click()
    await expect(page.getByText('JOKER SETS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
  })

  test('joker button hidden while joker set is pending (not yet logged)', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)
    await page.getByRole('button', { name: '+ JOKER SET' }).click()
    await expect(page.getByRole('button', { name: '+ JOKER SET' })).not.toBeVisible()
  })

  test('joker button reappears after joker logged at minimum reps', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)                           // AMRAP
    await page.getByRole('button', { name: '+ JOKER SET' }).click()
    await logSet(page, 5)                           // joker 1
    await expect(page.getByRole('button', { name: '+ JOKER SET' })).toBeVisible()
  })

  test('second joker button shows escalated weight — 85lb joker → 90lb next', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)
    await page.getByRole('button', { name: '+ JOKER SET' }).click()
    await logSet(page, 5)
    await expect(page.getByRole('button', { name: '90lb' })).toBeVisible()
  })

  test('joker button does not reappear after joker logged below minimum', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 5)                           // AMRAP — good
    await page.getByRole('button', { name: '+ JOKER SET' }).click()
    await logSet(page, 4)                           // joker — below week 1 min of 5
    await expect(page.getByRole('button', { name: '+ JOKER SET' })).not.toBeVisible()
  })
})

// Threshold timing (60/90/180/300s nudge & critical phases) is covered by
// restStatus unit tests in src/lib/calc.test.ts. The integration tests below
// verify only that the Workout screen sets the correct restType — the worker-
// driven UI text transitions live in the unit suite to avoid mocking our own
// timer worker.
test.describe('rest type wiring on log', () => {
  const pollRestType = (page: Parameters<typeof logSet>[0]) =>
    expect.poll(async () => (await getWorkoutState(page))?.restType)

  test('last warmup→main sets restType to transition', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 5)
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await logSet(page, 5)
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await logSet(page, 3) // last warmup → next is main = transition

    await expect.poll(async () => (await getWorkoutState(page))?.isResting).toBe(true)
    await pollRestType(page).toBe('transition')
  })

  test('main→main set sets restType to normal', async ({ page }) => {
    await startWorkout(page)
    await advanceThroughWarmups(page)
    await logSet(page, 5) // main set 1 → main set 2 = normal

    await pollRestType(page).toBe('normal')
  })

  test('AMRAP at or above program minimum sets restType to transition (to FSL)', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 6) // 6 >= 5 minimum; next set is FSL → transition

    await pollRestType(page).toBe('transition')
  })

  test('AMRAP below program minimum sets restType to fail', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 3) // 3 < 5 (week 1 minimum)

    await pollRestType(page).toBe('fail')
  })
})

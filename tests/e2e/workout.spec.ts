import { test, expect } from './fixtures'
import { freshStart, completeSetupWizard, startWorkout, logSet, getWorkoutState } from './helpers'

test.beforeEach(async ({ page }) => {
  await freshStart(page)
  await completeSetupWizard(page)
})

test.describe('workout flow', () => {
  test('START WORKOUT navigates to workout screen', async ({ page }) => {
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await expect(page.getByText('COMPLETE SESSION')).toBeVisible()
    await expect(page.getByText('WARM UP')).toBeVisible()
    await expect(page.getByText('MAIN')).toBeVisible()
  })

  test('active set shows weight and reps steppers and a LOG button', async ({ page }) => {
    await startWorkout(page)
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+' }).first()).toBeVisible()
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
    await expect(page.getByText('x 8')).toBeVisible()
    await expect(page.getByText('done')).toBeVisible()
  })
})

test.describe('session persistence across refresh', () => {
  test('workout screen survives a page reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.reload()
    await page.getByText('COMPLETE SESSION').waitFor()
    await expect(page.getByText('COMPLETE SESSION')).toBeVisible()
    await expect(page.getByText('WARM UP')).toBeVisible()
  })

  test('logged sets are still shown after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)
    await page.reload()
    await page.getByText('x 8').waitFor()
    await expect(page.getByText('x 8')).toBeVisible()
    await expect(page.getByText('done')).toBeVisible()
  })

  test('set index position is restored after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'LOG' }).waitFor()
    // Still on set 2 after reload
    await expect(page.getByRole('button', { name: 'LOG' })).toBeVisible()
  })
})

test.describe('rest timer persistence across refresh', () => {
  test('rest timer is still running after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'SKIP REST' }).waitFor()
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()
  })

  test('timer shows elapsed time from original start, not from reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)

    // Wait for timer to advance past zero (event-driven, no arbitrary sleep)
    await expect(page.getByTestId('rest-timer-display')).not.toHaveText('0:00')
    const restStartedAt = (await getWorkoutState(page))?.restStartedAt

    await page.reload()
    await page.getByRole('button', { name: 'SKIP REST' }).waitFor()

    // restStartedAt must be the same original timestamp (not reset on reload)
    expect((await getWorkoutState(page))?.restStartedAt).toBe(restStartedAt)

    // Timer display should show at least 1 second
    const timerText = await page.getByTestId('rest-timer-display').textContent()
    const [, mm, ss] = (timerText ?? '').match(/(\d+):(\d+)/) ?? []
    const elapsed = parseInt(mm ?? '0') * 60 + parseInt(ss ?? '0')
    expect(elapsed).toBeGreaterThanOrEqual(1)
  })
})

test.describe('resume banner and abandon dialog', () => {
  test('Today shows resume banner when session is active', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await expect(page.getByText('SESSION IN PROGRESS')).toBeVisible()
  })

  test('resume banner navigates to workout', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.getByText('SESSION IN PROGRESS').click()
    await expect(page.getByText('COMPLETE SESSION')).toBeVisible()
  })

  test('starting a different lift shows abandon confirm dialog', async ({ page }) => {
    await startWorkout(page) // starts OHP (first lift)
    await page.goto('/today')
    await page.getByRole('button', { name: 'Deadlift' }).click()
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await expect(page.getByText('ABANDON SESSION?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ABANDON' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'CANCEL' })).toBeVisible()
  })

  test('cancel closes the abandon dialog without changing session', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.getByRole('button', { name: 'Deadlift' }).click()
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await page.getByRole('button', { name: 'CANCEL' }).click()
    await expect(page.getByText('ABANDON SESSION?')).not.toBeVisible()
    // Original session still active
    await expect(page.getByText('SESSION IN PROGRESS')).toBeVisible()
  })

  test('START WORKOUT for the same lift resumes without wiping logged sets', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)
    await page.getByRole('button', { name: 'SKIP REST' }).click()

    await page.goto('/today')
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await page.getByText('COMPLETE SESSION').waitFor()

    // Should be back on the workout screen with the logged set still there
    await expect(page.getByText('COMPLETE SESSION')).toBeVisible()
    await expect(page.getByText('x 8')).toBeVisible()
    await expect(page.getByText('done')).toBeVisible()
  })
})

// Helper: advance through warmup + 2 main sets to reach the AMRAP set.
// With TM=95 / OHP week 1: 1 warmup (45lb bar), main = 60lb, 70lb, then AMRAP at 80lb.
async function advanceToAmrap(page: Parameters<typeof logSet>[0]) {
  await logSet(page, 10) // warmup
  await page.getByRole('button', { name: 'SKIP REST' }).click()
  await logSet(page, 5)  // main set 1
  await page.getByRole('button', { name: 'SKIP REST' }).click()
  await logSet(page, 5)  // main set 2
  await page.getByRole('button', { name: 'SKIP REST' }).click()
  // currentSetIndex is now on the AMRAP set
}

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

test.describe('rest timer thresholds and AMRAP fail detection', () => {
  const getRestState = (page: Parameters<typeof logSet>[0]) => getWorkoutState(page)

  test('warmup→main transition sets restType to transition', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10) // warmup set; next set is main → transition

    const state = await getRestState(page)
    expect(state?.isResting).toBe(true)
    expect(state?.restType).toBe('transition')
  })

  test('main→main set sets restType to normal', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)                            // warmup → skip
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await logSet(page, 5)                             // main set 1 → main set 2 = normal

    const state = await getRestState(page)
    expect(state?.restType).toBe('normal')
  })

  test('AMRAP at or above program minimum sets restType to transition (to FSL)', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 6) // 6 >= 5 minimum; next set is FSL → transition

    const state = await getRestState(page)
    expect(state?.restType).toBe('transition')
  })

  test('AMRAP below program minimum sets restType to fail', async ({ page }) => {
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 3) // 3 < 5 (week 1 minimum)

    const state = await getRestState(page)
    expect(state?.restType).toBe('fail')
  })

  test('"TIME FOR YOUR NEXT SET" appears after 60s on exercise transition', async ({ page }) => {
    await page.clock.install()
    await startWorkout(page)
    await logSet(page, 10) // warmup→main = transition

    await page.clock.fastForward(60_000)
    await expect(page.getByText('TIME FOR YOUR NEXT SET')).toBeVisible()
  })

  test('"TIME FOR YOUR NEXT SET" appears after 90s on same-exercise set', async ({ page }) => {
    await page.clock.install()
    await startWorkout(page)
    await logSet(page, 10)                           // warmup (transition, 60s)
    await page.getByRole('button', { name: 'SKIP REST' }).click()
    await logSet(page, 5)                            // main set 1 → main set 2 = normal (90s)

    await page.clock.fastForward(90_000)
    await expect(page.getByText('TIME FOR YOUR NEXT SET')).toBeVisible()
  })

  test('"TIME FOR YOUR NEXT SET" appears after 180s on failed AMRAP', async ({ page }) => {
    await page.clock.install()
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 3) // fail

    await page.clock.fastForward(180_000)
    await expect(page.getByText('TIME FOR YOUR NEXT SET')).toBeVisible()
  })

  test('"REST UP — SET FAILED" appears after 300s on failed AMRAP', async ({ page }) => {
    await page.clock.install()
    await startWorkout(page)
    await advanceToAmrap(page)
    await logSet(page, 3) // below week 1 minimum of 5

    await page.clock.fastForward(300_000)
    await expect(page.getByText('REST UP — SET FAILED')).toBeVisible()
  })
})

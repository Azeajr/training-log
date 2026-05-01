import { test, expect } from 'playwright/test'
import { freshStart, completeSetupWizard, startWorkout, logSet } from './helpers'

test.beforeEach(async ({ page }) => {
  await freshStart(page)
  await completeSetupWizard(page)
})

test.describe('workout flow', () => {
  test('START WORKOUT navigates to workout screen', async ({ page }) => {
    await page.click('button:has-text("START WORKOUT")')
    await expect(page.locator('text=COMPLETE SESSION')).toBeVisible()
    await expect(page.locator('text=WARM UP')).toBeVisible()
    await expect(page.locator('text=MAIN')).toBeVisible()
  })

  test('active set shows reps input and LOG button', async ({ page }) => {
    await startWorkout(page)
    await expect(page.locator('input[type=number]').first()).toBeVisible()
    await expect(page.locator('button:has-text("LOG")')).toBeVisible()
  })

  test('logging a set starts the rest timer', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)

    await expect(page.locator('button:has-text("SKIP REST")')).toBeVisible()
  })

  test('SKIP REST dismisses the timer', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.click('button:has-text("SKIP REST")')

    await expect(page.locator('button:has-text("SKIP REST")')).not.toBeVisible()
  })

  test('logged set appears as completed row', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)

    await expect(page.locator('text=x 8')).toBeVisible()
    await expect(page.locator('text=done')).toBeVisible()
  })
})

test.describe('session persistence across refresh', () => {
  test('workout screen survives a page reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)

    await page.reload()
    await page.waitForTimeout(1200)

    await expect(page.locator('text=COMPLETE SESSION')).toBeVisible()
    await expect(page.locator('text=WARM UP')).toBeVisible()
  })

  test('logged sets are still shown after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)

    await page.reload()
    await page.waitForTimeout(1200)

    await expect(page.locator('text=x 8')).toBeVisible()
    await expect(page.locator('text=done')).toBeVisible()
  })

  test('set index position is restored after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)
    await page.click('button:has-text("SKIP REST")')

    // Second set should now be active (showing LOG button for set 2)
    await expect(page.locator('button:has-text("LOG")')).toBeVisible()

    await page.reload()
    await page.waitForTimeout(1200)

    // Still on set 2 after reload
    await expect(page.locator('button:has-text("LOG")')).toBeVisible()
  })
})

test.describe('rest timer persistence across refresh', () => {
  test('rest timer is still running after reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)

    await expect(page.locator('button:has-text("SKIP REST")')).toBeVisible()

    await page.reload()
    await page.waitForTimeout(1200)

    await expect(page.locator('button:has-text("SKIP REST")')).toBeVisible()
  })

  test('timer shows elapsed time from original start, not from reload', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 10)

    // Wait a couple seconds before reloading so there's measurable elapsed time
    await page.waitForTimeout(2500)
    const restStartedAt = await page.evaluate(() => {
      const stored = localStorage.getItem('workout-store')
      return stored ? JSON.parse(stored).state.restStartedAt : null
    })

    await page.reload()
    await page.waitForTimeout(1200)

    // restStartedAt must be the same original timestamp (not reset on reload)
    const restStartedAfter = await page.evaluate(() => {
      const stored = localStorage.getItem('workout-store')
      return stored ? JSON.parse(stored).state.restStartedAt : null
    })
    expect(restStartedAfter).toBe(restStartedAt)

    // Timer display should show at least 2 seconds
    const timerText = await page.locator('text=/REST\\s+\\d+:\\d+/').first().textContent()
    const [, mm, ss] = (timerText ?? '').match(/(\d+):(\d+)/) ?? []
    const elapsed = parseInt(mm ?? '0') * 60 + parseInt(ss ?? '0')
    expect(elapsed).toBeGreaterThanOrEqual(2)
  })
})

test.describe('resume banner and abandon dialog', () => {
  test('Today shows resume banner when session is active', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.waitForTimeout(800)

    await expect(page.locator('text=SESSION IN PROGRESS')).toBeVisible()
  })

  test('resume banner navigates to workout', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.waitForTimeout(800)

    await page.click('text=SESSION IN PROGRESS')
    await expect(page.locator('text=COMPLETE SESSION')).toBeVisible()
  })

  test('starting a different lift shows abandon confirm dialog', async ({ page }) => {
    await startWorkout(page) // starts OHP (first lift)
    await page.goto('/today')
    await page.waitForTimeout(800)

    // Select Deadlift (second lift) and try to start
    await page.click('button:has-text("Deadlift")')
    await page.waitForTimeout(400)
    await page.click('button:has-text("START WORKOUT")')

    await expect(page.locator('text=ABANDON SESSION?')).toBeVisible()
    await expect(page.locator('button:has-text("ABANDON")')).toBeVisible()
    await expect(page.locator('button:has-text("CANCEL")')).toBeVisible()
  })

  test('cancel closes the abandon dialog without changing session', async ({ page }) => {
    await startWorkout(page)
    await page.goto('/today')
    await page.waitForTimeout(800)

    await page.click('button:has-text("Deadlift")')
    await page.waitForTimeout(400)
    await page.click('button:has-text("START WORKOUT")')
    await page.click('button:has-text("CANCEL")')

    await expect(page.locator('text=ABANDON SESSION?')).not.toBeVisible()
    // Original session still active
    await expect(page.locator('text=SESSION IN PROGRESS')).toBeVisible()
  })

  test('START WORKOUT for the same lift resumes without wiping logged sets', async ({ page }) => {
    await startWorkout(page)
    await logSet(page, 8)
    await page.click('button:has-text("SKIP REST")')

    // Navigate to Today and tap START WORKOUT for the same lift (OHP)
    await page.goto('/today')
    await page.waitForTimeout(800)
    await page.click('button:has-text("START WORKOUT")')
    await page.waitForTimeout(800)

    // Should be back on the workout screen with the logged set still there
    await expect(page.locator('text=COMPLETE SESSION')).toBeVisible()
    await expect(page.locator('text=x 8')).toBeVisible()
    await expect(page.locator('text=done')).toBeVisible()
  })
})

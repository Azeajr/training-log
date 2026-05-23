import { type Locator, type Page, expect } from 'playwright/test'

type E2EWindow = Window & { __e2eResetDb?: () => Promise<void> }

export async function freshStart(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as E2EWindow).__e2eResetDb === 'function')
  await page.evaluate(async () => {
    await (window as E2EWindow).__e2eResetDb!()
    localStorage.clear()
  })
  await page.reload()
  await page.waitForFunction(() => typeof (window as E2EWindow).__e2eResetDb === 'function')
}

async function fillStepper(locator: Locator, value: number) {
  await locator.getByTestId('stepper-value').click()
  const input = locator.getByTestId('stepper-input')
  await input.fill(String(value))
  await input.press('Enter')
}

const TM_LIFT_NAMES = ['ohp', 'deadlift', 'bench', 'squat']

export async function completeSetupWizard(page: Page, tms = [95, 95, 135, 135]) {
  await expect(page.getByRole('heading', { name: /STEP 1/ })).toBeVisible()
  for (let i = 0; i < tms.length; i++) {
    await fillStepper(page.getByTestId(`stepper-tm-${TM_LIFT_NAMES[i]}`), tms[i] ?? 100)
  }
  await page.getByRole('button', { name: 'NEXT' }).click()
  await expect(page.getByRole('heading', { name: /STEP 2/ })).toBeVisible()
  await page.getByRole('button', { name: 'START TRAINING' }).click()
  await expect(page.getByText('WEEK 1')).toBeVisible()
}

export async function startWorkout(page: Page) {
  await page.getByRole('button', { name: 'START WORKOUT' }).click()
  await expect(page.getByRole('button', { name: 'COMPLETE SESSION' })).toBeVisible()
}

export async function logSet(page: Page, reps: number) {
  await fillStepper(page.getByTestId('stepper-reps'), reps)
  await page.getByRole('button', { name: 'LOG' }).click()
  await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible()
}

export async function getWorkoutState(page: Page) {
  return page.evaluate(() => {
    const stored = localStorage.getItem('workout-store')
    return stored ? (JSON.parse(stored).state as Record<string, unknown>) : null
  })
}

// Logs all 3 warmup sets and dismisses rest after each — leaves cursor at the
// first main set.
export async function advanceThroughWarmups(page: Page) {
  await logSet(page, 5)
  await page.getByRole('button', { name: 'SKIP REST' }).click()
  await logSet(page, 5)
  await page.getByRole('button', { name: 'SKIP REST' }).click()
  await logSet(page, 3)
  await page.getByRole('button', { name: 'SKIP REST' }).click()
}

// Advances through 3 warmups + 2 main sets to reach the AMRAP set.
// With TM=95 / OHP week 1: warmups 45/50/55lb, main 60/70/80(AMRAP)lb.
export async function advanceToAmrap(page: Page) {
  await advanceThroughWarmups(page)
  await logSet(page, 5)  // main set 1
  await page.getByRole('button', { name: 'SKIP REST' }).click()
  await logSet(page, 5)  // main set 2
  await page.getByRole('button', { name: 'SKIP REST' }).click()
}

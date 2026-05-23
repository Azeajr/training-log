import type { Locator, Page } from 'playwright/test'

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
  await locator.locator('button').nth(1).click()
  const input = locator.locator('input[type=number]')
  await input.fill(String(value))
  await input.press('Enter')
}

const TM_LIFT_NAMES = ['ohp', 'deadlift', 'bench', 'squat']

export async function completeSetupWizard(page: Page, tms = [95, 95, 135, 135]) {
  await page.getByText('STEP 1').waitFor()
  for (let i = 0; i < tms.length; i++) {
    await fillStepper(page.getByTestId(`stepper-tm-${TM_LIFT_NAMES[i]}`), tms[i] ?? 100)
  }
  await page.getByRole('button', { name: 'NEXT' }).click()
  await page.getByText('STEP 2').waitFor()
  await page.getByRole('button', { name: 'START TRAINING' }).click()
  await page.getByText('WEEK 1').waitFor()
}

export async function startWorkout(page: Page) {
  await page.getByRole('button', { name: 'START WORKOUT' }).click()
  await page.getByText('COMPLETE SESSION').waitFor()
}

export async function logSet(page: Page, reps: number) {
  await fillStepper(page.getByTestId('stepper-reps'), reps)
  await page.getByRole('button', { name: 'LOG' }).click()
  await page.getByRole('button', { name: 'SKIP REST' }).waitFor()
}

export async function getWorkoutState(page: Page) {
  return page.evaluate(() => {
    const stored = localStorage.getItem('workout-store')
    return stored ? (JSON.parse(stored).state as Record<string, unknown>) : null
  })
}

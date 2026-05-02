import type { Page } from 'playwright/test'

export async function freshStart(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    indexedDB.deleteDatabase('TrainingLog')
    localStorage.clear()
  })
  await page.reload()
  await page.waitForTimeout(800)
}

// Open a Stepper into edit mode, fill a value, commit with Enter.
async function fillStepper(page: Page, stepperIndex: number, value: number) {
  const steppers = page.locator('.flex.items-center.font-mono')
  const valueBtn = steppers.nth(stepperIndex).locator('button').nth(1)
  await valueBtn.click()
  const input = page.locator('input[type=number]').first()
  await input.fill(String(value))
  await input.press('Enter')
}

export async function completeSetupWizard(page: Page, tms = [95, 95, 135, 135]) {
  await page.waitForSelector('text=STEP 1')
  // Four Steppers on the setup screen, one per lift (OHP, Bench, Squat, Deadlift)
  for (let i = 0; i < tms.length; i++) {
    await fillStepper(page, i, tms[i] ?? 100)
  }
  await page.click('button:has-text("NEXT")')
  await page.waitForSelector('text=STEP 2')
  await page.click('button:has-text("START TRAINING")')
  await page.waitForSelector('text=WEEK 1')
}

export async function startWorkout(page: Page) {
  await page.click('button:has-text("START WORKOUT")')
  await page.waitForSelector('text=COMPLETE SESSION')
}

// Log the active set with the given rep count.
// The active set has two Steppers: weight (index 0) and reps (index 1).
export async function logSet(page: Page, reps: number) {
  await fillStepper(page, 1, reps)
  await page.click('button:has-text("LOG")')
  await page.waitForTimeout(400)
}

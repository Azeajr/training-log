import { test, expect } from './fixtures'
import { completeSetupWizard, startWorkout } from './helpers'

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

test('diagnostics captures scrolling, occlusion and focus without notes, survives reload and exports', async ({ page }) => {
  await completeSetupWizard(page)
  await page.getByRole('link', { name: 'SETTINGS' }).click()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await page.getByRole('link', { name: 'TODAY' }).click()
  await expect(page.getByRole('button', { name: 'Capture issue' })).toBeVisible()
  await startWorkout(page)
  // The control sits over every screen's top row; the full-width lift header
  // under it must still take a centre tap (an intercepted click fails here).
  await page.getByRole('button', { name: /View history for/ }).click()
  await page.getByRole('button', { name: '← BACK' }).click()
  await page.getByPlaceholder('session notes...').fill('PRIVATE-NOTE-MUST-NOT-BE-TRACED')
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => {
    const events = JSON.parse(localStorage.getItem('notif-trace') ?? '{"e":[]}').e
    return events.some((e: {ev: string; d?: {scroll?: number[]}}) => e.ev === 'layout.sample' && (e.d?.scroll?.[1] ?? 0) > 0)
  })).toBe(true)

  // A controlled visual fault proves the capture can expose the bug class:
  // a transformed ancestor changes what a fixed bar is positioned against.
  await page.evaluate(() => {
    document.querySelector('main')!.style.transform = 'translateY(-120px)'
  })
  await page.getByRole('button', { name: 'Capture issue' }).tap()
  const capture = await page.evaluate(() => {
    const events = JSON.parse(localStorage.getItem('notif-trace')!).e
    return events.findLast((e: {ev: string}) => e.ev === 'layout.capture')
  })
  expect(capture.d.route).toBe('/workout')
  expect(capture.d.visualViewport.height).toBeGreaterThan(0)
  const bar = capture.d.anchors.find((a: {landmark: string}) => a.landmark === 'session-bar')
  expect(bar.css.position).toBe('fixed')
  expect(bar.ancestors.some((a: {css: {transform: string}}) => a.css.transform.includes('-120'))).toBe(true)
  expect(JSON.stringify(capture)).not.toContain('PRIVATE-NOTE-MUST-NOT-BE-TRACED')
  await page.evaluate(() => { document.querySelector('main')!.style.transform = '' })

  await page.reload()
  await expect(page.getByRole('button', { name: 'Capture issue' })).toBeVisible()
  await page.getByRole('link', { name: 'SETTINGS' }).click()
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
  await page.getByRole('link', { name: 'TODAY' }).click()
  await expect(page.getByRole('button', { name: 'Capture issue' })).toBeHidden()
  await page.getByRole('link', { name: 'SETTINGS' }).click()
  await page.getByText('More options', {exact:true}).click()
  await page.getByRole('button', { name: 'Show trace', exact: true }).click()
  const text = await page.getByTestId('trace-text').textContent()
  expect(text).toContain('layout.capture')
  expect(text).toContain('session-bar')
  expect(text).not.toContain('PRIVATE-NOTE-MUST-NOT-BE-TRACED')
})

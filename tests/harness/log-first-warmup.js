// Agent harness journey: `pnpm harness run tests/harness/log-first-warmup.js` against the
// `configured` fixture. Starts the OHP session, logs the first warm-up through the visible
// stepper, and checks the app's own accounting agrees with the screen.
async (page, { step, assert, observe, state }) => {
  const before = await state(['session', 'counts'])
  assert(before.session === null, 'A session was already in progress')
  await step('start workout', async () => {
    await page.getByRole('button', { name: 'START WORKOUT' }).click()
    await page.getByRole('button', { name: 'LOG' }).waitFor({ timeout: 10000 })
  })
  await step('log first warm-up', async () => {
    await page.getByRole('button', { name: 'LOG' }).click()
    await page.getByRole('button', { name: 'SKIP REST' }).waitFor({ timeout: 10000 })
  })
  const after = await state(['session', 'counts'])
  assert(after.session?.loggedSets === 1, `expected 1 logged set, got ${after.session?.loggedSets}`)
  assert(after.session?.resting === true, 'rest did not start after LOG')
  const rest = await observe(page.getByRole('button', { name: 'SKIP REST' }))
  assert(rest.elements[0]?.inViewport, 'SKIP REST is not reachable on screen')
  return { session: after.session, counts: after.counts }
}

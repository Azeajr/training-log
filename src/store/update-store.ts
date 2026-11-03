import { createSwUpdater } from '../lib/sw-update'

/**
 * The app's one service worker updater. `start()` is called from main.tsx in a
 * production build only; the dev server serves no SW, so in dev and under
 * vitest this stays inert and `updateReady()` is always false.
 */
export const appUpdate = createSwUpdater({
  container: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  doc: document,
  reload: () => location.reload(),
})

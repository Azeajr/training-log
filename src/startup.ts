// Startup orchestration, split out of `main.tsx` so its failure paths can be
// tested. `main.tsx` is a module side effect that renders into the document —
// nothing in it was reachable from a test, which is why the missing catch below
// went unnoticed.
//
// Two things went wrong before:
//
//   F04  `dbReady.then(seed).then(loadSettings).then(render)` had no `.catch`.
//        Any rejection became an unhandled promise and the page simply stayed on
//        the LOADING markup in index.html, with no message and no way forward.
//
//   F02  The worker falls back to a non-persistent in-memory database when OPFS
//        is unavailable, and reports it as `persistent: false` — which nothing
//        read. The app came up looking healthy and lost everything on reload.
//
// Both are now outcomes the caller has to handle rather than states it can miss.

export type StartupResult =
  | { status: 'ready'; persistent: boolean }
  | { status: 'failed'; error: Error }

export type StartupDeps = {
  dbReady: Promise<{ persistent: boolean }>
  seed: () => Promise<unknown>
  loadSettings: () => Promise<unknown>
}

export async function prepareApp(deps: StartupDeps): Promise<StartupResult> {
  try {
    const { persistent } = await deps.dbReady
    await deps.seed()
    await deps.loadSettings()
    return { status: 'ready', persistent }
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err : new Error(String(err)) }
  }
}

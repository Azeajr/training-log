// The two startup outcomes that are not "the app runs". Both replace the
// LOADING markup in index.html, which is otherwise what the user is left
// looking at forever (F04).

function Frame(props: { children: unknown }) {
  return (
    <div class="min-h-screen bg-bg text-text flex items-center justify-center px-6">
      <div role="alert" class="w-full max-w-sm border border-danger">
        {props.children as never}
      </div>
    </div>
  )
}

/** Startup failed outright: no database, so there is no app to show. */
export function StartupError(props: { error: Error; onRetry: () => void }) {
  return (
    <Frame>
      <div class="px-4 py-4">
        <div class="text-danger text-xs uppercase tracking-widest mb-2">Couldn't start</div>
        <div class="text-text text-sm mb-1">The training database didn't open.</div>
        <div class="text-faint text-xs mb-4 break-words">{props.error.message}</div>
        <button
          onClick={props.onRetry}
          class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase"
        >
          RETRY
        </button>
      </div>
    </Frame>
  )
}

/**
 * The database opened, but not persistently — the worker fell back to an
 * in-memory database because OPFS was unavailable. Everything will work and
 * then vanish on reload, so this is not something to start quietly into (F02).
 */
export function StorageUnavailable(props: { onRetry: () => void; onContinue: () => void }) {
  return (
    <Frame>
      <div class="px-4 py-4">
        <div class="text-danger text-xs uppercase tracking-widest mb-2">Storage unavailable</div>
        <div class="text-text text-sm mb-1">
          This device wouldn't give the app persistent storage, so nothing you log will survive
          closing or reloading the page.
        </div>
        <div class="text-faint text-xs mb-4">
          Private browsing and full device storage are the usual causes. Reloading often fixes it.
        </div>
        <div class="flex gap-3">
          <button
            onClick={props.onRetry}
            class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase"
          >
            RELOAD
          </button>
          <button
            onClick={props.onContinue}
            class="border border-faint text-faint px-3 py-1 text-xs tracking-widest uppercase"
          >
            CONTINUE WITHOUT SAVING
          </button>
        </div>
      </div>
    </Frame>
  )
}

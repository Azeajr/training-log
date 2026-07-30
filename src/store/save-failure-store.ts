import { createSignal } from 'solid-js'

// A set that the user performed but the database refused to keep.
//
// The only signal for this used to be a `showToast(...)` that cleared itself
// after 2500ms. Mid-workout the user's attention is on the bar, not the phone,
// so a missed toast meant the set silently wasn't there — with no banner, no
// badge, and no way to find out later short of noticing the rep count looks
// short in History. That is precisely the loss a training log exists to prevent.
//
// So a failure now leaves two traces. The in-memory one drives a banner that
// stays until the user retries or dismisses it, and carries the closure that
// re-attempts the write. The localStorage one is a small serializable record
// that outlives a reload or a killed tab, so History can flag the session as
// having a known gap even after the retry closure is gone.
export interface SaveFailure {
  id: number
  sessionId: number
  /** What was lost, in the user's terms: "Main set 3 · 255lb × 8". */
  describe: string
  /** The underlying error text, shown small. */
  message: string
  /** Re-attempt the write. Absent once the page has reloaded. */
  retry?: () => Promise<void>
}

/** The serializable half — what survives a reload. */
export interface SessionGap {
  sessionId: number
  describe: string
  at: number
}

const STORAGE_KEY = 'session-gaps'
const STORAGE_VERSION = 1
// Bounded so a database that is failing every write can't grow this without
// limit; the oldest entries fall off. The flag is "this session has gaps", not
// a full audit log, so a cap costs nothing.
const MAX_GAPS = 200

function loadGaps(): SessionGap[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { v?: number; gaps?: unknown }
    if (parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.gaps)) return []
    return (parsed.gaps as unknown[]).filter((g): g is SessionGap =>
      g != null && typeof g === 'object' && !Array.isArray(g)
      && Number.isInteger((g as SessionGap).sessionId)
      && typeof (g as SessionGap).describe === 'string'
      && typeof (g as SessionGap).at === 'number',
    )
  } catch {
    return []
  }
}

function persistGaps(gaps: SessionGap[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, gaps }))
  } catch {
    // A full or unavailable localStorage must not take down the workout: the
    // in-memory banner is still up, which is the part the user acts on.
  }
}

const [failures, setFailures] = createSignal<SaveFailure[]>([])
const [gaps, setGaps] = createSignal<SessionGap[]>(loadGaps())

export { failures, gaps }

let nextId = 1

export function recordSaveFailure(
  f: Omit<SaveFailure, 'id'>,
): number {
  const id = nextId++
  setFailures(prev => [...prev, { ...f, id }])
  const gap: SessionGap = { sessionId: f.sessionId, describe: f.describe, at: Date.now() }
  setGaps(prev => {
    const next = [...prev, gap].slice(-MAX_GAPS)
    persistGaps(next)
    return next
  })
  return id
}

/** Drop one banner entry and the gap record it created. */
export function clearSaveFailure(id: number): void {
  const f = failures().find(x => x.id === id)
  setFailures(prev => prev.filter(x => x.id !== id))
  if (!f) return
  // Match on the same (sessionId, describe) pair the record was written with,
  // removing one occurrence — two identical failed sets should clear one each.
  setGaps(prev => {
    const i = prev.findIndex(g => g.sessionId === f.sessionId && g.describe === f.describe)
    if (i === -1) return prev
    const next = [...prev.slice(0, i), ...prev.slice(i + 1)]
    persistGaps(next)
    return next
  })
}

/** Everything still unresolved for one session. */
export const gapsForSession = (sessionId: number): SessionGap[] =>
  gaps().filter(g => g.sessionId === sessionId)

/** Sessions with at least one unresolved gap, for History's flag. */
export const sessionIdsWithGaps = (): number[] => [...new Set(gaps().map(g => g.sessionId))]

/** Test helper — drops both halves. */
export function resetSaveFailures(): void {
  setFailures([])
  setGaps([])
  persistGaps([])
}

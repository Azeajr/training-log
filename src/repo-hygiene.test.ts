import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Assertions about the shape of the repository rather than the behaviour of the
// app. They belong in the suite because the things they pin are exactly the
// things nothing else notices: a file that silently never reaches git, or one
// that silently does reach production.

const root = join(import.meta.dirname, '..')

/** true when git would ignore this path. */
const isIgnored = (path: string): boolean => {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root })
    return true
  } catch {
    return false
  }
}

const trackedUnder = (dir: string): string[] =>
  execFileSync('git', ['ls-files', dir], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

// ── F83 ─────────────────────────────────────────────────────────────────────
// `.gitignore` ignored `.claude/` wholesale, yet five files under it are
// tracked — and CLAUDE.md points contributors at three of them as the project's
// key documents. An ignore rule cannot untrack what is already tracked, so
// those five kept working and nothing looked wrong; anything NEW written beside
// them was invisible to `git status` and never reached the repo.
describe('.claude/ docs are not silently ignored (F83)', () => {
  it('a new document beside the key docs is visible to git', () => {
    expect(isIgnored('.claude/NEW_DOC.md')).toBe(false)
    expect(isIgnored('.claude/reference/deep-dive.md')).toBe(false)
  })

  it('every already-tracked file there stays un-ignored', () => {
    const tracked = trackedUnder('.claude/')
    expect(tracked.length).toBeGreaterThan(0)
    for (const file of tracked) expect(isIgnored(file)).toBe(false)
  })

  it('still ignores the local scratch it was meant to', () => {
    for (const path of [
      '.claude/settings.local.json',
      '.claude/agents/whatever.md',
      '.claude/sessions/2026-01-01.md',
      '.claude/completions/anything.md',
    ]) {
      expect(isIgnored(path)).toBe(true)
    }
  })

  it('keeps the two README files that document those scratch directories', () => {
    for (const path of ['.claude/completions/README.md', '.claude/sessions/README.md']) {
      expect(isIgnored(path)).toBe(false)
      expect(existsSync(join(root, path))).toBe(true)
    }
  })

  it('the key documents CLAUDE.md names are tracked', () => {
    const named = readFileSync(join(root, 'CLAUDE.md'), 'utf8')
    const tracked = trackedUnder('.claude/')
    for (const doc of ['ARCHITECTURE_MAP.md', 'COMMON_MISTAKES.md', 'QUICK_START.md']) {
      expect(named).toContain(doc)
      expect(tracked).toContain(`.claude/${doc}`)
    }
  })
})

// ── F82 ─────────────────────────────────────────────────────────────────────
// `public/` is published verbatim, so a 45 KB export of real training history
// sitting there was fetchable at /demo-seed.json on the deployed site while
// nothing in the app ever read it. B10 moved it to `fixtures/` to stop the
// publishing; it was **deleted outright on 2026-09-17**, because the purpose
// that kept it alive — import it by hand through Settings to reach a demo
// state — is one the single user of this app has no reason to want, holding a
// copy of their own real training history to serve it.
describe('the demo seed is gone (F82)', () => {
  it('is in neither public/ nor fixtures/', () => {
    expect(existsSync(join(root, 'public', 'demo-seed.json'))).toBe(false)
    expect(existsSync(join(root, 'fixtures', 'demo-seed.json'))).toBe(false)
  })

  // Everything here is published verbatim to the deployed site, so the list is
  // an allowlist and a new entry is a decision, not a formality.
  const ALLOWED = [
    '_headers',
    'apple-touch-icon.png',
    'favicon.svg',
    'icon-192.png',
    'icon-512.png',
  ]

  it('public/ carries only what the app actually serves', () => {
    const published = execFileSync('git', ['ls-files', 'public/'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(p => p.replace('public/', ''))
    expect(published.sort()).toEqual([...ALLOWED].sort())
  })

  // `git ls-files` sees only what is TRACKED, and vite copies public/ into the
  // build whatever git thinks. So a file created but not yet committed is
  // already publishable while this suite reports green — which is exactly what
  // happened when a keepalive loop was added to public/: the local run passed
  // and CI failed on the very next push. Reading the directory closes that
  // window locally.
  it('has nothing in public/ on disk that the allowlist does not name', () => {
    const onDisk = readdirSync(join(root, 'public')).sort()
    expect(onDisk).toEqual([...ALLOWED].sort())
  })
})

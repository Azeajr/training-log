/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// ── F84 ─────────────────────────────────────────────────────────────────────
// scripts/migrate-history.py used to restate seed.ts's lift and exercise tables
// as hardcoded copies, "must match seed.ts order so IDs are 1-4" — and they had
// already drifted: exercise 3 was "Curls" in the script and 'Bicep Curls' in
// seed.ts, and seed.ts had grown from 18 entries to 27. A migration emitting
// the stale name lands a SECOND exercise beside the seeded one on import, and
// F41 records that once two exercises share a name the repair path is closed.
//
// The script reads seed.ts now, so they cannot diverge. This guards the parser:
// a seed.ts reformat that stopped matching would silently emit an empty roster,
// and a user would import a history with no lifts at all.
function hasPython(): boolean {
  try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); return true }
  catch { return false }
}

/** Names as the script would emit them, in id order. */
function scriptTables(): { lifts: string[]; exercises: string[] } {
  const out = execFileSync('python3', ['-c', `
import importlib.util, json
spec = importlib.util.spec_from_file_location("m", "scripts/migrate-history.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps({
  "lifts": [l["name"] for l in sorted(m.LIFTS, key=lambda x: x["id"])],
  "exercises": [e["name"] for e in sorted(m.EXERCISES, key=lambda x: x["id"])],
}))
`], { encoding: 'utf8' })
  return JSON.parse(out) as { lifts: string[]; exercises: string[] }
}

/** Names as seed.ts declares them, in file order. */
function seedTables(): { lifts: string[]; exercises: string[] } {
  const src = readFileSync('src/db/seed.ts', 'utf8')
  const block = (name: string) => {
    const m = new RegExp('const ' + name + ' = \\[(.*?)\\n\\]', 's').exec(src)
    if (!m) throw new Error(`no ${name} block in seed.ts`)
    return [...m[1].matchAll(/name: '([^']+)'/g)].map(x => x[1])
  }
  return { lifts: block('LIFTS'), exercises: block('EXERCISES') }
}

describe.skipIf(!hasPython())('migrate-history.py matches seed.ts (F84)', () => {
  it('emits the same lifts, in the same order', () => {
    expect(scriptTables().lifts).toEqual(seedTables().lifts)
  })

  it('emits the same exercises, in the same order', () => {
    expect(scriptTables().exercises).toEqual(seedTables().exercises)
  })

  it('emits a non-empty roster', () => {
    const t = scriptTables()
    expect(t.lifts).toHaveLength(4)
    expect(t.exercises.length).toBeGreaterThanOrEqual(18)
  })
})

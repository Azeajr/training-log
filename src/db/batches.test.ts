/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The fix ledger's "Remaining work, batched" section plans what is left. This
// keeps the plan and the ledger from drifting apart: every finding still marked
// `open` has to appear in exactly one batch, so a newly opened finding cannot
// quietly land outside the plan, and a batch cannot list an id that does not
// exist. Batch MEMBERSHIP is a judgement call and free to change; the partition
// being complete is not.
const LEDGER = 'docs/deep-code-review-fixes.md'

function ledger(): string {
  return readFileSync(LEDGER, 'utf8')
}

/** Ids by state, read from the ledger table itself. */
function findingsByState(src: string): Map<string, string> {
  const out = new Map<string, string>()
  const row = /^\| (F\d+) \|(?:[^|]*\|){4} `([a-z-]+)` \|/gm
  for (const m of src.matchAll(row)) out.set(m[1], m[2])
  return out
}

/** Ids listed under each `### n — name` batch heading. */
function batches(src: string): Map<string, string[]> {
  const start = src.indexOf('## Remaining work, batched')
  const end = src.indexOf('## Open leads', start)
  expect(start).toBeGreaterThan(-1)
  const body = src.slice(start, end)
  const out = new Map<string, string[]>()
  const sections = body.split(/^### /m).slice(1)
  for (const sec of sections) {
    const name = sec.split('\n')[0].trim()
    // Only the backticked id run directly under the heading, not prose mentions.
    const idLine = sec.split('\n').find(l => /^(`F\d+`\s*)+$/.test(l.trim()))
    out.set(name, idLine ? [...idLine.matchAll(/F\d+/g)].map(m => m[0]) : [])
  }
  return out
}

describe('the remaining-work plan covers the open findings', () => {
  const src = ledger()
  const state = findingsByState(src)
  const planned = batches(src)
  const allPlanned = [...planned.values()].flat()
  const open = [...state.entries()].filter(([, st]) => st === 'open').map(([id]) => id)

  it('parses both the ledger table and the batch sections', () => {
    expect(state.size).toBeGreaterThan(50)
    expect(planned.size).toBe(7)
    // Not a magic minimum: a closed batch legitimately empties, so the only
    // floor that stays true is "at least enough to cover what is still open".
    expect(allPlanned.length).toBeGreaterThanOrEqual(open.length)
  })

  it('places every open finding in a batch', () => {
    const missing = open.filter(id => !allPlanned.includes(id))
    expect(missing, `open but unplanned: ${missing.join(', ')}`).toEqual([])
  })

  it('places each finding in exactly one batch', () => {
    const dupes = allPlanned.filter((id, i) => allPlanned.indexOf(id) !== i)
    expect([...new Set(dupes)], `listed in more than one batch: ${dupes.join(', ')}`).toEqual([])
  })

  it('lists no finding that does not exist', () => {
    const unknown = allPlanned.filter(id => !state.has(id))
    expect(unknown, `planned but not in the ledger: ${unknown.join(', ')}`).toEqual([])
  })

  it('keeps the batch table counts in step with the sections', () => {
    // `| 2 | Destructive paths | 8 | **2** | ...`
    const rowCounts = [...src.matchAll(/^\| (\d) \| ([^|]+) \| (\d+) \|/gm)]
      .map(m => ({ n: Number(m[1]), count: Number(m[3]) }))
    expect(rowCounts).toHaveLength(7)
    const sizes = [...planned.values()].map(v => v.length)
    expect(rowCounts.map(r => r.count)).toEqual(sizes)
  })
})

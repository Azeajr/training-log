import { describe, it, expect, beforeEach } from 'vitest'
import {
  failures, gaps, recordSaveFailure, clearSaveFailure,
  gapsForSession, sessionIdsWithGaps, resetSaveFailures,
} from './save-failure-store'

const record = (sessionId: number, describe = 'Main set 3 · 255lb × 8') =>
  recordSaveFailure({ sessionId, describe, message: 'quota exceeded', retry: async () => {} })

describe('save-failure-store', () => {
  beforeEach(() => {
    resetSaveFailures()
    localStorage.clear()
  })

  it('records a failure in both the banner list and the persisted gaps', () => {
    record(7)
    expect(failures()).toHaveLength(1)
    expect(failures()[0]).toMatchObject({ sessionId: 7, message: 'quota exceeded' })
    expect(gaps()).toHaveLength(1)
    expect(gaps()[0]).toMatchObject({ sessionId: 7, describe: 'Main set 3 · 255lb × 8' })
  })

  it('hands back distinct ids so two identical failures stay separate', () => {
    const a = record(7)
    const b = record(7)
    expect(a).not.toBe(b)
    expect(failures().map(f => f.id)).toEqual([a, b])
  })

  it('clearing removes the banner entry and exactly one matching gap', () => {
    const a = record(7)
    record(7)
    clearSaveFailure(a)
    expect(failures()).toHaveLength(1)
    // Two identical failures wrote two gaps; clearing one must not clear both.
    expect(gaps()).toHaveLength(1)
  })

  it('clearing an unknown id is a no-op on the gaps', () => {
    record(7)
    clearSaveFailure(9999)
    expect(gaps()).toHaveLength(1)
    expect(failures()).toHaveLength(1)
  })

  it('scopes gaps to a session', () => {
    record(7, 'a')
    record(8, 'b')
    expect(gapsForSession(7).map(g => g.describe)).toEqual(['a'])
    expect(gapsForSession(8).map(g => g.describe)).toEqual(['b'])
    expect(gapsForSession(99)).toEqual([])
  })

  it('dedupes session ids for the History flag', () => {
    record(7); record(7); record(8)
    expect(sessionIdsWithGaps().sort()).toEqual([7, 8])
  })

  it('writes gaps to localStorage under a versioned key', () => {
    record(7)
    const raw = localStorage.getItem('session-gaps')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { v: number; gaps: unknown[] }
    expect(parsed.v).toBe(1)
    expect(parsed.gaps).toHaveLength(1)
  })

  it('a cleared gap is removed from localStorage too', () => {
    const id = record(7)
    clearSaveFailure(id)
    const parsed = JSON.parse(localStorage.getItem('session-gaps')!) as { gaps: unknown[] }
    expect(parsed.gaps).toEqual([])
  })
})

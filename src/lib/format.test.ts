import { describe, it, expect } from 'vitest'
import { formatDateShort, formatDateLong, formatDateIso } from './format'

describe('formatDateShort', () => {
  it('includes abbreviated month and day from Date', () => {
    const result = formatDateShort(new Date(2026, 0, 15)) // local Jan 15
    expect(result).toContain('Jan')
    expect(result).toContain('15')
  })

  it('accepts ISO string input', () => {
    const result = formatDateShort(new Date(2026, 5, 3)) // local Jun 3
    expect(result).toContain('Jun')
    expect(result).toContain('3')
  })

  it('does not include year', () => {
    const result = formatDateShort(new Date(2026, 0, 15))
    expect(result).not.toContain('2026')
  })
})

describe('formatDateLong', () => {
  it('includes abbreviated month, day, and year from Date', () => {
    const result = formatDateLong(new Date(2026, 0, 15)) // local Jan 15
    expect(result).toContain('Jan')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })

  it('accepts ISO string input', () => {
    const result = formatDateLong(new Date(2026, 11, 25)) // local Dec 25
    expect(result).toContain('Dec')
    expect(result).toContain('25')
    expect(result).toContain('2026')
  })
})

describe('formatDateIso', () => {
  it('returns YYYY-MM-DD for a local date', () => {
    expect(formatDateIso(new Date(2026, 2, 15))).toBe('2026-03-15') // local Mar 15
  })

  it('zero-pads month and day', () => {
    expect(formatDateIso(new Date(2026, 0, 1))).toBe('2026-01-01') // local Jan 1
  })

  it('output matches YYYY-MM-DD pattern', () => {
    expect(formatDateIso(new Date(2026, 10, 1))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // The bug this guards: toISOString() would roll a late-evening local session
  // forward a day in negative-offset zones, so the CSV date would disagree with
  // the local day formatDateShort/Long render in the UI. Use the local day.
  it('uses the local calendar day, agreeing with formatDateShort', () => {
    const evening = new Date(2026, 5, 20, 21, 30) // local Jun 20, 9:30pm
    expect(formatDateIso(evening)).toBe('2026-06-20')
    expect(formatDateShort(evening)).toContain('20')
    expect(formatDateShort(evening)).toContain('Jun')
  })
})

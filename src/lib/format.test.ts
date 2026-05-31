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
  it('returns YYYY-MM-DD from UTC ISO string', () => {
    expect(formatDateIso('2026-03-15T12:00:00.000Z')).toBe('2026-03-15')
  })

  it('returns YYYY-MM-DD from Date (UTC noon is unambiguous)', () => {
    expect(formatDateIso(new Date('2026-07-04T12:00:00.000Z'))).toBe('2026-07-04')
  })

  it('output matches YYYY-MM-DD pattern', () => {
    const result = formatDateIso('2026-11-01T12:00:00.000Z')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

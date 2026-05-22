// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from './index'
import { __resetForTest } from './sqlite-client'
import { SQLiteTable } from './sqlite-table'

beforeEach(async () => {
  await __resetForTest()
})

// Defense-in-depth: SQL identifiers cannot be bound as parameters, so the
// table layer interpolates them. Every safe call site uses a literal, but
// guard against future drift by rejecting non-identifier strings.
describe('SQL identifier guard', () => {
  it('rejects table names with quotes / semicolons at construction', () => {
    expect(() => new SQLiteTable<unknown>('lifts"; DROP TABLE lifts; --')).toThrow(/Invalid SQL identifier/)
    expect(() => new SQLiteTable<unknown>('with space')).toThrow(/Invalid SQL identifier/)
    expect(() => new SQLiteTable<unknown>('1leading-digit')).toThrow(/Invalid SQL identifier/)
  })

  it('accepts plain identifiers', () => {
    expect(() => new SQLiteTable<unknown>('lifts')).not.toThrow()
    expect(() => new SQLiteTable<unknown>('training_maxes')).not.toThrow()
    expect(() => new SQLiteTable<unknown>('_legal')).not.toThrow()
  })

  it('rejects malicious where() field name', () => {
    expect(() => db.lifts.where('name"; DROP TABLE lifts; --')).toThrow(/Invalid SQL identifier/)
  })

  it('rejects malicious orderBy() field name', () => {
    expect(() => db.lifts.orderBy('name"; DROP TABLE lifts; --')).toThrow(/Invalid SQL identifier/)
    expect(() => db.lifts.toCollection().orderBy('order"; --')).toThrow(/Invalid SQL identifier/)
  })

  it('rejects add() with column key containing quote injection', async () => {
    // Row object whose key is not a legal identifier — would otherwise be
    // interpolated verbatim into the INSERT column list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const malicious: any = { 'name"; DROP TABLE lifts; --': 'x' }
    await expect(db.lifts.add(malicious)).rejects.toThrow(/Invalid SQL identifier/)
  })

  it('rejects update() with column key containing quote injection', async () => {
    const id = await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const malicious: any = { 'name"; DROP TABLE lifts; --': 'x' }
    await expect(db.lifts.update(id, malicious)).rejects.toThrow(/Invalid SQL identifier/)
  })

  it('legal identifiers continue to work end-to-end', async () => {
    const id = await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const row = await db.lifts.where('id').equals(id).first()
    expect(row?.name).toBe('OHP')
    const sorted = await db.lifts.orderBy('name').toArray()
    expect(sorted).toHaveLength(1)
  })
})

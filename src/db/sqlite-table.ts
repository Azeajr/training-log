import { sqliteClient } from './sqlite-client'

export interface TableSchema {
  dateFields?: string[]
  boolFields?: string[]
  jsonFields?: string[]
}

// Identifiers (table names, column names) are interpolated into SQL because
// SQLite has no bind parameter for them. Every call site today passes a
// hardcoded literal, but interpolation + future refactors = injection risk.
// Reject anything that isn't a plain identifier so a future caller can't
// pass through user input (e.g. `name"; DROP TABLE x; --`).
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
function assertIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`Invalid SQL identifier: ${name}`)
  return name
}

function toSqlRow(obj: Record<string, unknown>, schema: TableSchema): Record<string, unknown> {
  const row = { ...obj }
  for (const f of schema.dateFields ?? []) {
    if (f in row && row[f] instanceof Date) row[f] = (row[f] as Date).toISOString()
  }
  for (const f of schema.boolFields ?? []) {
    if (f in row && row[f] != null) row[f] = row[f] ? 1 : 0
  }
  for (const f of schema.jsonFields ?? []) {
    if (f in row && row[f] != null) row[f] = JSON.stringify(row[f])
  }
  return row
}

function fromSqlRow<T>(row: Record<string, unknown>, schema: TableSchema): T {
  const result = { ...row }
  for (const f of schema.dateFields ?? []) {
    if (result[f] != null) result[f] = new Date(result[f] as string)
  }
  for (const f of schema.boolFields ?? []) {
    if (result[f] != null) result[f] = Boolean(result[f])
  }
  for (const f of schema.jsonFields ?? []) {
    if (result[f] != null) result[f] = JSON.parse(result[f] as string)
  }
  return result as T
}

// Single chainable query builder. State accumulates lazily; terminal methods
// (toArray/first/last/sortBy/delete) emit the SQL. Previous incarnation had five
// separate classes (WhereQuery / WhereClause / OrderByQuery / CollectionQuery /
// FilterQuery) — leftover scaffolding from the Dexie days when the chain had to
// match Dexie's surface across two backends. Now there's one backend.
class Query<T> {
  private readonly table: SQLiteTable<T>
  private whereSql: string | null = null
  private whereParams: unknown[] = []
  private orderField: string | null = null
  private orderDesc = false
  private filterFn: ((row: T) => boolean) | null = null
  private limitN: number | null = null

  constructor(table: SQLiteTable<T>) {
    this.table = table
  }

  // Mutating setter used by WhereClause to install the initial WHERE — the
  // builder is freshly constructed here so the mutation is local.
  _setWhere(clause: string, params: unknown[]): this {
    this.whereSql = clause
    this.whereParams = params
    return this
  }

  private clone(): Query<T> {
    const q = new Query<T>(this.table)
    q.whereSql = this.whereSql
    q.whereParams = this.whereParams
    q.orderField = this.orderField
    q.orderDesc = this.orderDesc
    q.filterFn = this.filterFn
    q.limitN = this.limitN
    return q
  }

  filter(fn: (row: T) => boolean): Query<T> {
    const next = this.clone()
    const prev = this.filterFn
    next.filterFn = prev ? (r: T) => prev(r) && fn(r) : fn
    return next
  }

  orderBy(field: string, desc = false): Query<T> {
    const next = this.clone()
    next.orderField = assertIdent(field)
    next.orderDesc = desc
    return next
  }

  private buildSelect(): string {
    let sql = `SELECT * FROM "${this.table.tableName}"`
    if (this.whereSql) sql += ` WHERE ${this.whereSql}`
    if (this.orderField) sql += ` ORDER BY "${this.orderField}"${this.orderDesc ? ' DESC' : ''}`
    if (this.limitN != null) sql += ` LIMIT ${this.limitN}`
    return sql
  }

  async toArray(): Promise<T[]> {
    const rows = await this.table._query(this.buildSelect(), this.whereParams)
    return this.filterFn ? rows.filter(this.filterFn) : rows
  }

  async first(): Promise<T | undefined> {
    if (this.filterFn) {
      const rows = await this.toArray()
      return rows[0]
    }
    const q = this.clone()
    q.limitN = 1
    const rows = await this.table._query(q.buildSelect(), q.whereParams)
    return rows[0]
  }

  async last(): Promise<T | undefined> {
    if (!this.orderField) throw new Error('Query.last() requires orderBy()')
    const q = this.clone()
    q.orderDesc = !q.orderDesc
    q.limitN = 1
    const rows = await this.table._query(q.buildSelect(), q.whereParams)
    return rows[0]
  }

  sortBy(field: string): Promise<T[]> {
    return this.orderBy(field).toArray()
  }

  async delete(): Promise<void> {
    if (this.filterFn) {
      const rows = await this.toArray()
      const ids = rows.map(r => (r as Record<string, unknown>).id as number)
      if (ids.length > 0) {
        const ph = ids.map(() => '?').join(',')
        await sqliteClient.run(`DELETE FROM "${this.table.tableName}" WHERE id IN (${ph})`, ids)
      }
      return
    }
    const whereClause = this.whereSql ? ` WHERE ${this.whereSql}` : ''
    await sqliteClient.run(`DELETE FROM "${this.table.tableName}"${whereClause}`, this.whereParams)
  }
}

class WhereClause<T> {
  private readonly table: SQLiteTable<T>
  private readonly field: string

  constructor(table: SQLiteTable<T>, field: string) {
    this.table = table
    this.field = assertIdent(field)
  }

  equals(value: unknown): Query<T> {
    return new Query<T>(this.table)._setWhere(`"${this.field}" = ?`, [value])
  }

  anyOf(values: unknown[]): Query<T> {
    const placeholders = values.map(() => '?').join(',')
    return new Query<T>(this.table)._setWhere(`"${this.field}" IN (${placeholders})`, values)
  }
}

export class SQLiteTable<T> {
  readonly tableName: string
  private schema: TableSchema

  constructor(tableName: string, schema: TableSchema = {}) {
    this.tableName = assertIdent(tableName)
    this.schema = schema
  }

  where(field: string): WhereClause<T> {
    return new WhereClause<T>(this, field)
  }

  orderBy(field: string): Query<T> {
    return new Query<T>(this).orderBy(field)
  }

  toCollection(): Query<T> {
    return new Query<T>(this)
  }

  filter(fn: (row: T) => boolean): Query<T> {
    return new Query<T>(this).filter(fn)
  }

  async toArray(): Promise<T[]> {
    return this._query(`SELECT * FROM "${this.tableName}"`, [])
  }

  async get(id: number): Promise<T | undefined> {
    const rows = await this._query(`SELECT * FROM "${this.tableName}" WHERE id = ?`, [id])
    return rows[0]
  }

  async add(obj: Omit<T, 'id'> | T): Promise<number> {
    const row = toSqlRow(obj as Record<string, unknown>, this.schema)
    if (row.id == null) delete row.id
    const cols = Object.keys(row).filter((k) => row[k] !== undefined).map(assertIdent)
    const values = cols.map((k) => row[k])
    const placeholders = cols.map(() => '?').join(',')
    const sql = `INSERT INTO "${this.tableName}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`
    const result = await sqliteClient.run(sql, values)
    return result.lastInsertRowid
  }

  async put(obj: T): Promise<number> {
    const row = toSqlRow(obj as Record<string, unknown>, this.schema)
    const cols = Object.keys(row).filter((k) => row[k] !== undefined).map(assertIdent)
    const values = cols.map((k) => row[k])
    const placeholders = cols.map(() => '?').join(',')
    const sql = `INSERT OR REPLACE INTO "${this.tableName}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`
    const result = await sqliteClient.run(sql, values)
    return result.lastInsertRowid
  }

  async update(id: number, changes: Partial<T>): Promise<number> {
    const row = toSqlRow(changes as Record<string, unknown>, this.schema)
    const cols = Object.keys(row).filter((k) => row[k] !== undefined && k !== 'id').map(assertIdent)
    if (cols.length === 0) return 0
    const setClauses = cols.map((k) => `"${k}" = ?`).join(', ')
    const values = cols.map((k) => row[k])
    const result = await sqliteClient.run(
      `UPDATE "${this.tableName}" SET ${setClauses} WHERE id = ?`,
      [...values, id],
    )
    return result.changes
  }

  async delete(id: number): Promise<void> {
    await sqliteClient.run(`DELETE FROM "${this.tableName}" WHERE id = ?`, [id])
  }

  async count(): Promise<number> {
    const rows = await sqliteClient.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM "${this.tableName}"`,
      [],
    )
    return rows[0]?.count ?? 0
  }

  async bulkAdd(items: T[]): Promise<void> {
    await this.transaction(async () => {
      for (const item of items) await this.add(item)
    })
  }

  async clear(): Promise<void> {
    await sqliteClient.run(`DELETE FROM "${this.tableName}"`, [])
  }

  async _query(sql: string, params: unknown[]): Promise<T[]> {
    const rows = await sqliteClient.query<Record<string, unknown>>(sql, params)
    return rows.map((r) => fromSqlRow<T>(r, this.schema))
  }

  transaction(fn: () => Promise<void>): Promise<void> {
    return sqliteClient.transaction(fn)
  }
}

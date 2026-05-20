type RunResult = { lastInsertRowid: number; changes: number }

class SqliteClient {
  private worker: Worker
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private nextId = 0
  readonly ready: Promise<{ persistent: boolean }>

  constructor() {
    this.worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const { id, result, error } = e.data
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      if (error) p.reject(new Error(error))
      else p.resolve(result)
    }
    this.ready = this.send<{ persistent: boolean }>('init', undefined, [])
  }

  private send<T>(type: string, sql: string | undefined, params: unknown[]): Promise<T> {
    const doSend = (): Promise<T> => new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.worker.postMessage({ id, type, sql, params })
    })
    return type !== 'init' ? this.ready.then(doSend) : doSend()
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.send<T[]>('query', sql, params)
  }

  run(sql: string, params: unknown[] = []): Promise<RunResult> {
    return this.send<RunResult>('run', sql, params)
  }

  async transaction(fn: () => Promise<void>): Promise<void> {
    await this.send('begin', undefined, [])
    try {
      await fn()
      await this.send('commit', undefined, [])
    } catch (err) {
      await this.send('rollback', undefined, [])
      throw err
    }
  }

  terminate() {
    this.worker.terminate()
  }
}

export const sqliteClient = new SqliteClient()
addEventListener('pagehide', (e) => { if (!(e as PageTransitionEvent).persisted) sqliteClient.terminate() })
export const dbReady = sqliteClient.ready

// Serialization helpers

interface TableSchema {
  dateFields?: string[]
  boolFields?: string[]
  jsonFields?: string[]
}

function toSqlRow(obj: Record<string, unknown>, schema: TableSchema): Record<string, unknown> {
  const row = { ...obj }
  for (const f of schema.dateFields ?? []) {
    if (row[f] instanceof Date) row[f] = (row[f] as Date).toISOString()
    else if (row[f] == null && f in row) row[f] = null
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

// Dexie-compatible query builder

class WhereQuery<T> {
  private table: SQLiteTable<T>
  private whereClause: string
  private params: unknown[]
  private filterFn?: (row: T) => boolean

  constructor(table: SQLiteTable<T>, whereClause: string, params: unknown[]) {
    this.table = table
    this.whereClause = whereClause
    this.params = params
  }

  filter(fn: (row: T) => boolean): WhereQuery<T> {
    const clone = new WhereQuery<T>(this.table, this.whereClause, this.params)
    clone.filterFn = this.filterFn ? (r) => this.filterFn!(r) && fn(r) : fn
    return clone
  }

  and(fn: (row: T) => boolean): WhereQuery<T> {
    return this.filter(fn)
  }

  async toArray(): Promise<T[]> {
    const rows = await this.table._query(
      `SELECT * FROM "${this.table.tableName}" WHERE ${this.whereClause}`,
      this.params,
    )
    return this.filterFn ? rows.filter(this.filterFn) : rows
  }

  async first(): Promise<T | undefined> {
    const rows = await this.toArray()
    return rows[0]
  }

  async sortBy(field: string): Promise<T[]> {
    const rows = await this.table._query(
      `SELECT * FROM "${this.table.tableName}" WHERE ${this.whereClause} ORDER BY "${field}"`,
      this.params,
    )
    return this.filterFn ? rows.filter(this.filterFn) : rows
  }

  async delete(): Promise<void> {
    if (this.filterFn) {
      const rows = await this.toArray()
      for (const row of rows) {
        await this.table.delete((row as Record<string, unknown>).id as number)
      }
    } else {
      await sqliteClient.run(
        `DELETE FROM "${this.table.tableName}" WHERE ${this.whereClause}`,
        this.params,
      )
    }
  }
}

class WhereClause<T> {
  private table: SQLiteTable<T>
  private field: string
  constructor(table: SQLiteTable<T>, field: string) {
    this.table = table
    this.field = field
  }

  equals(value: unknown): WhereQuery<T> {
    return new WhereQuery<T>(this.table, `"${this.field}" = ?`, [value])
  }

  anyOf(values: unknown[]): WhereQuery<T> {
    const placeholders = values.map(() => '?').join(',')
    return new WhereQuery<T>(this.table, `"${this.field}" IN (${placeholders})`, values)
  }
}

class CollectionQuery<T> {
  private table: SQLiteTable<T>
  constructor(table: SQLiteTable<T>) { this.table = table }

  async first(): Promise<T | undefined> {
    const rows = await this.table._query(
      `SELECT * FROM "${this.table.tableName}" LIMIT 1`,
      [],
    )
    return rows[0]
  }

  async toArray(): Promise<T[]> {
    return this.table.toArray()
  }
}

class FilterQuery<T> {
  private table: SQLiteTable<T>
  private fn: (row: T) => boolean
  constructor(table: SQLiteTable<T>, fn: (row: T) => boolean) {
    this.table = table
    this.fn = fn
  }

  async toArray(): Promise<T[]> {
    const rows = await this.table.toArray()
    return rows.filter(this.fn)
  }
}

class OrderByQuery<T> {
  private table: SQLiteTable<T>
  private field: string
  constructor(table: SQLiteTable<T>, field: string) {
    this.table = table
    this.field = field
  }

  async last(): Promise<T | undefined> {
    const rows = await this.table._query(
      `SELECT * FROM "${this.table.tableName}" ORDER BY "${this.field}" DESC LIMIT 1`,
      [],
    )
    return rows[0]
  }

  async toArray(): Promise<T[]> {
    return this.table._query(
      `SELECT * FROM "${this.table.tableName}" ORDER BY "${this.field}"`,
      [],
    )
  }
}

export class SQLiteTable<T> {
  readonly tableName: string
  private schema: TableSchema

  constructor(tableName: string, schema: TableSchema = {}) {
    this.tableName = tableName
    this.schema = schema
  }

  where(field: string): WhereClause<T> {
    return new WhereClause<T>(this, field)
  }

  orderBy(field: string): OrderByQuery<T> {
    return new OrderByQuery<T>(this, field)
  }

  toCollection(): CollectionQuery<T> {
    return new CollectionQuery<T>(this)
  }

  filter(fn: (row: T) => boolean): FilterQuery<T> {
    return new FilterQuery<T>(this, fn)
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
    const cols = Object.keys(row).filter((k) => row[k] !== undefined)
    const values = cols.map((k) => row[k])
    const placeholders = cols.map(() => '?').join(',')
    const sql = `INSERT INTO "${this.tableName}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders}) RETURNING id`
    const rows = await sqliteClient.query<{ id: number }>(sql, values)
    return rows[0]?.id ?? 0
  }

  async put(obj: T): Promise<number> {
    const row = toSqlRow(obj as Record<string, unknown>, this.schema)
    const cols = Object.keys(row).filter((k) => row[k] !== undefined)
    const values = cols.map((k) => row[k])
    const placeholders = cols.map(() => '?').join(',')
    const sql = `INSERT OR REPLACE INTO "${this.tableName}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders}) RETURNING id`
    const rows = await sqliteClient.query<{ id: number }>(sql, values)
    return rows[0]?.id ?? 0
  }

  async update(id: number, changes: Partial<T>): Promise<number> {
    const row = toSqlRow(changes as Record<string, unknown>, this.schema)
    const cols = Object.keys(row).filter((k) => row[k] !== undefined && k !== 'id')
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
    for (const item of items) {
      await this.add(item)
    }
  }

  async clear(): Promise<void> {
    await sqliteClient.run(`DELETE FROM "${this.tableName}"`, [])
  }

  async _query(sql: string, params: unknown[]): Promise<T[]> {
    const rows = await sqliteClient.query<Record<string, unknown>>(sql, params)
    return rows.map((r) => fromSqlRow<T>(r, this.schema))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(_mode: 'rw', _tables: SQLiteTable<any>[], fn: () => Promise<void>): Promise<void> {
    return sqliteClient.transaction(fn)
  }
}

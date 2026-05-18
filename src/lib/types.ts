import type {
  Lift, TrainingMax, Cycle, Session, Set,
  Exercise, LiftAccessory, AccessoryTrainingMax, AccessorySet, Settings,
} from '../types/domain'

export interface TableLike<T> {
  toArray(): Promise<T[]>
  add(obj: Omit<T, 'id'> | T): Promise<number>
  get(id: number): Promise<T | undefined>
  update(id: number, changes: Partial<T>): Promise<number>
  delete(id: number): Promise<void>
  count(): Promise<number>
  clear(): Promise<void>
  bulkAdd(items: T[]): Promise<void>
  where(field: string): {
    equals(v: unknown): {
      toArray(): Promise<T[]>
      first(): Promise<T | undefined>
      sortBy(field: string): Promise<T[]>
      delete(): Promise<any>
      filter(fn: (row: T) => boolean): {
        first(): Promise<T | undefined>
        toArray(): Promise<T[]>
      }
      and(fn: (row: T) => boolean): {
        delete(): Promise<any>
        toArray(): Promise<T[]>
      }
    }
    anyOf(values: unknown[]): {
      toArray(): Promise<T[]>
      filter(fn: (row: T) => boolean): { toArray(): Promise<T[]> }
    }
  }
  orderBy(field: string): { last(): Promise<T | undefined>; toArray(): Promise<T[]> }
  toCollection(): { first(): Promise<T | undefined> }
  filter(fn: (row: T) => boolean): { toArray(): Promise<T[]> }
}

export interface TrainingDB {
  lifts: TableLike<Lift>
  trainingMaxes: TableLike<TrainingMax>
  cycles: TableLike<Cycle>
  sessions: TableLike<Session>
  sets: TableLike<Set>
  exercises: TableLike<Exercise>
  liftAccessories: TableLike<LiftAccessory>
  accessoryTrainingMaxes: TableLike<AccessoryTrainingMax>
  accessorySets: TableLike<AccessorySet>
  settings: TableLike<Settings>
  transaction(mode: 'rw', tables: TableLike<unknown>[], fn: () => Promise<void>): Promise<void>
}

import { SQLiteTable, dbReady, sqliteClient } from './sqlite-client'
import type {
  Lift,
  TrainingMax,
  Cycle,
  Session,
  Set,
  Exercise,
  LiftAccessory,
  AccessoryTrainingMax,
  AccessorySet,
  Settings,
} from '../types/domain'

export type { SQLiteTable } from './sqlite-client'

class TrainingSQLiteDB {
  lifts = new SQLiteTable<Lift>('lifts')
  trainingMaxes = new SQLiteTable<TrainingMax>('trainingMaxes', { dateFields: ['setAt'] })
  cycles = new SQLiteTable<Cycle>('cycles', { dateFields: ['startDate', 'endDate'] })
  sessions = new SQLiteTable<Session>('sessions', { dateFields: ['date'] })
  sets = new SQLiteTable<Set>('sets', { boolFields: ['isAmrap'] })
  exercises = new SQLiteTable<Exercise>('exercises', { boolFields: ['archived'] })
  liftAccessories = new SQLiteTable<LiftAccessory>('liftAccessories')
  accessoryTrainingMaxes = new SQLiteTable<AccessoryTrainingMax>('accessoryTrainingMaxes', {
    dateFields: ['setAt'],
  })
  accessorySets = new SQLiteTable<AccessorySet>('accessorySets')
  settings = new SQLiteTable<Settings>('settings', { jsonFields: ['plates'] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(_mode: 'rw', _tables: SQLiteTable<any>[], fn: () => Promise<void>): Promise<void> {
    return sqliteClient.transaction(fn)
  }
}

export const db = new TrainingSQLiteDB()
export type TrainingDB = TrainingSQLiteDB
export { dbReady }

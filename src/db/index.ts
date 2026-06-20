import { SQLiteTable } from './sqlite-table'
import { dbReady, sqliteClient } from './sqlite-client'
import type {
  Lift,
  TrainingMax,
  Cycle,
  Session,
  Set,
  Exercise,
  LiftAccessory,
  LiftSupplemental,
  AccessoryTrainingMax,
  AccessorySet,
  Settings,
} from '../types/domain'

export type { SQLiteTable } from './sqlite-table'

class TrainingSQLiteDB {
  lifts = new SQLiteTable<Lift>('lifts', { boolFields: ['archived'] })
  trainingMaxes = new SQLiteTable<TrainingMax>('trainingMaxes', { dateFields: ['setAt'] })
  cycles = new SQLiteTable<Cycle>('cycles', { dateFields: ['startDate', 'endDate'] })
  sessions = new SQLiteTable<Session>('sessions', { dateFields: ['date'] })
  sets = new SQLiteTable<Set>('sets', { boolFields: ['isAmrap'] })
  exercises = new SQLiteTable<Exercise>('exercises', { boolFields: ['archived'] })
  liftAccessories = new SQLiteTable<LiftAccessory>('liftAccessories')
  liftSupplementals = new SQLiteTable<LiftSupplemental>('liftSupplementals')
  accessoryTrainingMaxes = new SQLiteTable<AccessoryTrainingMax>('accessoryTrainingMaxes', {
    dateFields: ['setAt'],
  })
  accessorySets = new SQLiteTable<AccessorySet>('accessorySets')
  settings = new SQLiteTable<Settings>('settings', { jsonFields: ['plates'] })

  transaction(fn: () => Promise<void>): Promise<void> {
    return sqliteClient.transaction(fn)
  }
}

export const db = new TrainingSQLiteDB()
export type TrainingDB = TrainingSQLiteDB
export { dbReady }

import { SQLiteTable } from './sqlite-table'
import { dbReady, sqliteClient } from './sqlite-client'
import type {
  Lift,
  TrainingMax,
  Cycle,
  Session,
  Set,
  Exercise,
  LiftSupplemental,
  AccessoryTrainingMax,
  AccessorySet,
  AccessoryNote,
  AssistanceDefault,
  Settings,
  PtRoutine,
  PtExercise,
  PtSession,
  PtSetCheck,
  PtNote,
} from '../types/domain'

export type { SQLiteTable } from './sqlite-table'

class TrainingSQLiteDB {
  lifts = new SQLiteTable<Lift>('lifts', { boolFields: ['archived', 'usesBarbell'], jsonFields: ['bandProfile'] })
  trainingMaxes = new SQLiteTable<TrainingMax>('trainingMaxes', { dateFields: ['setAt'] })
  cycles = new SQLiteTable<Cycle>('cycles', { dateFields: ['startDate', 'endDate'] })
  sessions = new SQLiteTable<Session>('sessions', { dateFields: ['date'] })
  sets = new SQLiteTable<Set>('sets', { boolFields: ['isAmrap'], jsonFields: ['bandLoad'] })
  exercises = new SQLiteTable<Exercise>('exercises', { boolFields: ['archived', 'usesBarbell'], jsonFields: ['bandProfile'] })
  liftSupplementals = new SQLiteTable<LiftSupplemental>('liftSupplementals')
  accessoryTrainingMaxes = new SQLiteTable<AccessoryTrainingMax>('accessoryTrainingMaxes', {
    dateFields: ['setAt'],
  })
  accessorySets = new SQLiteTable<AccessorySet>('accessorySets', { jsonFields: ['dropRounds', 'bandLoad'] })
  accessoryNotes = new SQLiteTable<AccessoryNote>('accessoryNotes')
  assistanceDefaults = new SQLiteTable<AssistanceDefault>('assistanceDefaults')
  ptRoutines = new SQLiteTable<PtRoutine>('ptRoutines', { boolFields: ['archived'] })
  ptExercises = new SQLiteTable<PtExercise>('ptExercises', { boolFields: ['archived'] })
  ptSessions = new SQLiteTable<PtSession>('ptSessions', { dateFields: ['date'] })
  ptSetChecks = new SQLiteTable<PtSetCheck>('ptSetChecks', { boolFields: ['done', 'recorded'] })
  ptNotes = new SQLiteTable<PtNote>('ptNotes')
  settings = new SQLiteTable<Settings>('settings', { jsonFields: ['plates', 'bands'], boolFields: ['hasDeloadWeek', 'restTimerNotifications'] })

  transaction(fn: () => Promise<void>): Promise<void> {
    return sqliteClient.transaction(fn)
  }
}

export const db = new TrainingSQLiteDB()
export type TrainingDB = TrainingSQLiteDB
export { dbReady }

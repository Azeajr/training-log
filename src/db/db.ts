import Dexie, { type Table } from 'dexie'
import type {
  Lift, TrainingMax, Cycle, Session, Set,
  Exercise, LiftAccessory, AccessoryTrainingMax, AccessorySet, Settings,
} from '../types/domain'

export type { Lift, TrainingMax, Cycle, Session, Set, Exercise, LiftAccessory, AccessoryTrainingMax, AccessorySet, Settings }

export class TrainingDB extends Dexie {
  lifts!: Table<Lift>
  trainingMaxes!: Table<TrainingMax>
  cycles!: Table<Cycle>
  sessions!: Table<Session>
  sets!: Table<Set>
  exercises!: Table<Exercise>
  liftAccessories!: Table<LiftAccessory>
  accessoryTrainingMaxes!: Table<AccessoryTrainingMax>
  accessorySets!: Table<AccessorySet>
  settings!: Table<Settings>

  constructor() {
    super('TrainingLog')
    this.version(1).stores({
      lifts: '++id, name',
      trainingMaxes: '++id, liftId, setAt',
      cycles: '++id, number',
      sessions: '++id, cycleId, liftId, week, status',
      sets: '++id, sessionId, type',
      exercises: '++id, name, type',
      liftAccessories: '++id, liftId, exerciseId',
      accessoryTrainingMaxes: '++id, exerciseId, setAt',
      accessorySets: '++id, sessionId, exerciseId',
      settings: '++id',
    })
    this.version(2).stores({
      lifts: '++id, name, order',
    })
  }

  // Override Dexie's transaction to support the (fn) shape used by lib/* code.
  // When called with a single function arg, wraps a 'rw' txn over all tables.
  // Falls through to Dexie's original overloads for any other call shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(modeOrFn: any, ...rest: any[]): any {
    if (typeof modeOrFn === 'function') {
      return super.transaction('rw', [
        this.lifts, this.trainingMaxes, this.cycles, this.sessions, this.sets,
        this.exercises, this.liftAccessories, this.accessoryTrainingMaxes, this.accessorySets, this.settings,
      ], modeOrFn)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (super.transaction as any)(modeOrFn, ...rest)
  }
}

export const db = new TrainingDB()
export const dbReady: Promise<{ persistent: boolean }> = Promise.resolve({ persistent: false })

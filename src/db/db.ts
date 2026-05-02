import Dexie, { type Table } from 'dexie'

export interface Lift {
  id?: number
  name: 'OHP' | 'Bench' | 'Squat' | 'Deadlift'
  order: number
  progressionIncrement: number
  baseWeight: number
  liftType: 'upper' | 'lower'
}

export interface TrainingMax {
  id?: number
  liftId: number
  weight: number
  setAt: Date
}

export interface Cycle {
  id?: number
  number: number
  startDate: Date
  endDate: Date | null
}

export interface Session {
  id?: number
  cycleId: number
  liftId: number
  week: 1 | 2 | 3 | 4
  date: Date
  notes: string | null
  status: 'pending' | 'completed' | 'skipped'
}

export interface Set {
  id?: number
  sessionId: number
  type: 'warmup' | 'main' | 'fsl'
  setNumber: number
  weight: number
  reps: number
  isAmrap: boolean
}

export interface Exercise {
  id?: number
  name: string
  type: 'reps' | 'timed' | 'distance'
}

export interface LiftAccessory {
  id?: number
  liftId: number
  exerciseId: number
  order: number
}

export interface AccessoryTrainingMax {
  id?: number
  exerciseId: number
  weight: number
  incrementLb: number
  setAt: Date
}

export interface AccessorySet {
  id?: number
  sessionId: number
  exerciseId: number
  setNumber: number
  weight: number | null
  reps: number | null
  duration: number | null
  distance: number | null
}

export interface PlateConfig {
  weight: number
  count: number
}

export interface Settings {
  id?: number
  restTimer1: number
  restTimer2: number
  restTimerFail: number
  theme?: string
  barWeight?: number
  plates?: PlateConfig[]
}

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
      settings: '++id'
    })
  }
}

export const db = new TrainingDB()

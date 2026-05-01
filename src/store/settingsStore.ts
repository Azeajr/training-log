import { create } from 'zustand'
import { db } from '../db/db'

interface SettingsState {
  restTimer1: number
  restTimer2: number
  restTimerFail: number
  loaded: boolean
  load: () => Promise<void>
  update: (updates: Partial<Omit<SettingsState, 'loaded' | 'load' | 'update'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  restTimer1: 90,
  restTimer2: 180,
  restTimerFail: 300,
  loaded: false,

  load: async () => {
    const settings = await db.settings.toCollection().first()
    if (settings) {
      set({
        restTimer1: settings.restTimer1,
        restTimer2: settings.restTimer2,
        restTimerFail: settings.restTimerFail,
        loaded: true,
      })
    }
  },

  update: async (updates) => {
    const settings = await db.settings.toCollection().first()
    if (settings?.id) {
      await db.settings.update(settings.id, updates)
      set(updates)
    }
  },
}))

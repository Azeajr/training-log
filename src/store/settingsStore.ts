import { create } from 'zustand'
import { db } from '../db/db'

export const THEMES = {
  dark: {
    label: 'Dark',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#09090b',
      '--color-surface':      '#18181b',
      '--color-surface-high': '#27272a',
      '--color-border-dim':   '#27272a',
      '--color-border':       '#3f3f46',
      '--color-text':         '#f4f4f5',
      '--color-text-dim':     '#d4d4d8',
      '--color-muted':        '#71717a',
      '--color-faint':        '#3f3f46',
      '--color-on-accent':    '#09090b',
      '--color-accent':       '#4ade80',
      '--color-warn':         '#fbbf24',
      '--color-danger':       '#f87171',
    },
  },
  light: {
    label: 'Light',
    colorScheme: 'light' as const,
    vars: {
      '--color-bg':           '#fafafa',
      '--color-surface':      '#ffffff',
      '--color-surface-high': '#f4f4f5',
      '--color-border-dim':   '#e4e4e7',
      '--color-border':       '#d4d4d8',
      '--color-text':         '#18181b',
      '--color-text-dim':     '#52525b',
      '--color-muted':        '#71717a',
      '--color-faint':        '#a1a1aa',
      '--color-on-accent':    '#ffffff',
      '--color-accent':       '#15803d',
      '--color-warn':         '#b45309',
      '--color-danger':       '#dc2626',
    },
  },
  dim: {
    label: 'Dim',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#0c0a09',
      '--color-surface':      '#1c1917',
      '--color-surface-high': '#292524',
      '--color-border-dim':   '#44403c',
      '--color-border':       '#57534e',
      '--color-text':         '#f5f5f4',
      '--color-text-dim':     '#d6d3d1',
      '--color-muted':        '#a8a29e',
      '--color-faint':        '#78716c',
      '--color-on-accent':    '#0c0a09',
      '--color-accent':       '#fb923c',
      '--color-warn':         '#fbbf24',
      '--color-danger':       '#f87171',
    },
  },
}

export type ThemeKey = keyof typeof THEMES

const DEFAULT_THEME: ThemeKey = 'dark'

const applyTheme = (key: string) => {
  const theme = THEMES[key as ThemeKey] ?? THEMES[DEFAULT_THEME]
  for (const [prop, value] of Object.entries(theme.vars)) {
    document.documentElement.style.setProperty(prop, value)
  }
  document.documentElement.style.colorScheme = theme.colorScheme
}

interface SettingsState {
  restTimer1: number
  restTimer2: number
  restTimerFail: number
  theme: string
  loaded: boolean
  load: () => Promise<void>
  update: (updates: Partial<Omit<SettingsState, 'loaded' | 'load' | 'update'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  restTimer1: 90,
  restTimer2: 180,
  restTimerFail: 300,
  theme: DEFAULT_THEME,
  loaded: false,

  load: async () => {
    const settings = await db.settings.toCollection().first()
    if (settings) {
      const theme = settings.theme ?? DEFAULT_THEME
      applyTheme(theme)
      set({
        restTimer1: settings.restTimer1,
        restTimer2: settings.restTimer2,
        restTimerFail: settings.restTimerFail,
        theme,
        loaded: true,
      })
    }
  },

  update: async (updates) => {
    const settings = await db.settings.toCollection().first()
    if (settings?.id) {
      await db.settings.update(settings.id, updates)
      if (updates.theme) applyTheme(updates.theme)
      set(updates)
    }
  },
}))

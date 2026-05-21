import { createStore } from 'solid-js/store'
import { db } from '../db/index'
import type { PlateConfig, SupplementalTemplate } from '../types/domain'

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
export const DEFAULT_BAR_WEIGHT = 45
export const DEFAULT_PLATES: PlateConfig[] = [
  { weight: 45,  count: 4 },
  { weight: 35,  count: 2 },
  { weight: 25,  count: 4 },
  { weight: 15,  count: 2 },
  { weight: 10,  count: 4 },
  { weight: 5,   count: 4 },
  { weight: 2.5, count: 4 },
]

export function applyTheme(key: string) {
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
  barWeight: number
  plates: PlateConfig[]
  supplementalTemplate: SupplementalTemplate
  loaded: boolean
}

export const [settings, setSettings] = createStore<SettingsState>({
  restTimer1: 90,
  restTimer2: 180,
  restTimerFail: 300,
  theme: DEFAULT_THEME,
  barWeight: DEFAULT_BAR_WEIGHT,
  plates: DEFAULT_PLATES,
  supplementalTemplate: 'fsl+bbb',
  loaded: false,
})

export async function loadSettings() {
  const row = await db.settings.toCollection().first()
  if (row) {
    const theme = row.theme ?? DEFAULT_THEME
    applyTheme(theme)
    setSettings({
      restTimer1: row.restTimer1,
      restTimer2: row.restTimer2,
      restTimerFail: row.restTimerFail,
      theme,
      barWeight: row.barWeight ?? DEFAULT_BAR_WEIGHT,
      plates: row.plates ?? DEFAULT_PLATES,
      supplementalTemplate: row.supplementalTemplate ?? 'fsl+bbb',
      loaded: true,
    })
  }
}

export async function updateSettings(
  updates: Partial<Omit<SettingsState, 'loaded'>>
) {
  const row = await db.settings.toCollection().first()
  if (row?.id) {
    await db.settings.update(row.id, updates)
    if (updates.theme) applyTheme(updates.theme)
    setSettings(updates)
  }
}

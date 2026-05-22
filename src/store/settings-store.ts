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
  rosepine: {
    label: 'Rosé Pine',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#191724',
      '--color-surface':      '#1f1d2e',
      '--color-surface-high': '#26233a',
      '--color-border-dim':   '#26233a',
      '--color-border':       '#403d52',
      '--color-text':         '#e0def4',
      '--color-text-dim':     '#908caa',
      '--color-muted':        '#6e6a86',
      '--color-faint':        '#524f67',
      '--color-on-accent':    '#191724',
      '--color-accent':       '#9ccfd8',
      '--color-warn':         '#f6c177',
      '--color-danger':       '#eb6f92',
    },
  },
  mocha: {
    label: 'Mocha',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#1e1e2e',
      '--color-surface':      '#181825',
      '--color-surface-high': '#313244',
      '--color-border-dim':   '#313244',
      '--color-border':       '#45475a',
      '--color-text':         '#cdd6f4',
      '--color-text-dim':     '#bac2de',
      '--color-muted':        '#a6adc8',
      '--color-faint':        '#7f849c',
      '--color-on-accent':    '#1e1e2e',
      '--color-accent':       '#cba6f7',
      '--color-warn':         '#f9e2af',
      '--color-danger':       '#f38ba8',
    },
  },
  latte: {
    label: 'Latte',
    colorScheme: 'light' as const,
    vars: {
      '--color-bg':           '#eff1f5',
      '--color-surface':      '#e6e9ef',
      '--color-surface-high': '#ccd0da',
      '--color-border-dim':   '#ccd0da',
      '--color-border':       '#bcc0cc',
      '--color-text':         '#4c4f69',
      '--color-text-dim':     '#5c5f77',
      '--color-muted':        '#6c6f85',
      '--color-faint':        '#8c8fa1',
      '--color-on-accent':    '#eff1f5',
      '--color-accent':       '#8839ef',
      '--color-warn':         '#df8e1d',
      '--color-danger':       '#d20f39',
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

export const SETTINGS_DEFAULTS = {
  restTimer1: 90,
  restTimer2: 180,
  restTimerFail: 300,
  theme: DEFAULT_THEME as string,
  barWeight: DEFAULT_BAR_WEIGHT,
  plates: DEFAULT_PLATES,
  supplementalTemplate: 'fsl+bbb' as SupplementalTemplate,
}

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
}

export const [settings, setSettings] = createStore<SettingsState>({ ...SETTINGS_DEFAULTS })

export async function loadSettings() {
  const row = await db.settings.toCollection().first()
  if (!row) return
  setSettings({
    restTimer1: row.restTimer1,
    restTimer2: row.restTimer2,
    restTimerFail: row.restTimerFail,
    theme: row.theme ?? DEFAULT_THEME,
    barWeight: row.barWeight ?? DEFAULT_BAR_WEIGHT,
    plates: row.plates ?? DEFAULT_PLATES,
    supplementalTemplate: row.supplementalTemplate ?? 'fsl+bbb',
  })
}

export async function updateSettings(
  updates: Partial<SettingsState>
) {
  const row = await db.settings.toCollection().first()
  if (row?.id) {
    await db.settings.update(row.id, updates)
  } else {
    await db.settings.add({ ...SETTINGS_DEFAULTS, ...updates })
  }
  if (updates.theme) applyTheme(updates.theme)
  setSettings(updates)
}

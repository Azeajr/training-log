import { createStore } from 'solid-js/store'
import { db } from '../db/index'
import type { PlateConfig, SupplementalTemplate, DeloadSupplemental } from '../types/domain'

export const THEMES = {
  oled: {
    label: 'OLED',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#000000',
      '--color-surface':      '#080808',
      '--color-surface-high': '#141414',
      '--color-border-dim':   '#303030',
      '--color-border':       '#525252',
      '--color-text':         '#e5e5e5',
      '--color-text-dim':     '#cccccc',
      '--color-muted':        '#a3a3a3',
      '--color-faint':        '#737373',
      '--color-on-accent':    '#000000',
      '--color-accent':       '#4ade80',
      '--color-warn':         '#fbbf24',
      '--color-danger':       '#fb7185',
      '--color-info':         '#60a5fa',
    },
  },
  'oled-light': {
    label: 'OLED Light',
    colorScheme: 'light' as const,
    vars: {
      '--color-bg':           '#ffffff',
      '--color-surface':      '#ffffff',
      '--color-surface-high': '#f0f0f0',
      '--color-border-dim':   '#e0e0e0',
      '--color-border':       '#b8b8b8',
      '--color-text':         '#0a0a0a',
      '--color-text-dim':     '#333333',
      '--color-muted':        '#5c5c5c',
      '--color-faint':        '#8a8a8a',
      '--color-on-accent':    '#ffffff',
      '--color-accent':       '#08752f',
      '--color-warn':         '#9a4b00',
      '--color-danger':       '#c5162e',
      '--color-info':         '#1456c0',
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
      '--color-info':         '#c4a7e7',
    },
  },
  frappe: {
    label: 'Frappé',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#303446',
      '--color-surface':      '#292c3c',
      '--color-surface-high': '#414559',
      '--color-border-dim':   '#414559',
      '--color-border':       '#51576d',
      '--color-text':         '#c6d0f5',
      '--color-text-dim':     '#b5bfe2',
      '--color-muted':        '#a5adce',
      '--color-faint':        '#737994',
      '--color-on-accent':    '#303446',
      '--color-accent':       '#ca9ee6',
      '--color-warn':         '#e5c890',
      '--color-danger':       '#e78284',
      '--color-info':         '#8caaee',
    },
  },
  macchiato: {
    label: 'Macchiato',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#24273a',
      '--color-surface':      '#1e2030',
      '--color-surface-high': '#363a4f',
      '--color-border-dim':   '#363a4f',
      '--color-border':       '#494d64',
      '--color-text':         '#cad3f5',
      '--color-text-dim':     '#b8c0e0',
      '--color-muted':        '#a5adcb',
      '--color-faint':        '#6e738d',
      '--color-on-accent':    '#24273a',
      '--color-accent':       '#c6a0f6',
      '--color-warn':         '#eed49f',
      '--color-danger':       '#ed8796',
      '--color-info':         '#8aadf4',
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
      '--color-info':         '#89b4fa',
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
      '--color-info':         '#1e66f5',
    },
  },
  'solarized-dark': {
    label: 'Solarized',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#002b36',
      '--color-surface':      '#073642',
      '--color-surface-high': '#0b4653',
      '--color-border-dim':   '#174a55',
      '--color-border':       '#586e75',
      '--color-text':         '#eee8d5',
      '--color-text-dim':     '#93a1a1',
      '--color-muted':        '#839496',
      '--color-faint':        '#657b83',
      '--color-on-accent':    '#002b36',
      '--color-accent':       '#2aa198',
      '--color-warn':         '#b58900',
      '--color-danger':       '#dc322f',
      '--color-info':         '#268bd2',
    },
  },
  gruvbox: {
    label: 'Gruvbox',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#282828',
      '--color-surface':      '#1d2021',
      '--color-surface-high': '#3c3836',
      '--color-border-dim':   '#504945',
      '--color-border':       '#665c54',
      '--color-text':         '#ebdbb2',
      '--color-text-dim':     '#d5c4a1',
      '--color-muted':        '#a89984',
      '--color-faint':        '#7c6f64',
      '--color-on-accent':    '#282828',
      '--color-accent':       '#b8bb26',
      '--color-warn':         '#fabd2f',
      '--color-danger':       '#fb4934',
      '--color-info':         '#83a598',
    },
  },
  nord: {
    label: 'Nord',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#2e3440',
      '--color-surface':      '#272c36',
      '--color-surface-high': '#3b4252',
      '--color-border-dim':   '#434c5e',
      '--color-border':       '#4c566a',
      '--color-text':         '#eceff4',
      '--color-text-dim':     '#e5e9f0',
      '--color-muted':        '#b7c0d0',
      '--color-faint':        '#7b88a1',
      '--color-on-accent':    '#2e3440',
      '--color-accent':       '#88c0d0',
      '--color-warn':         '#ebcb8b',
      '--color-danger':       '#bf616a',
      '--color-info':         '#81a1c1',
    },
  },
  dracula: {
    label: 'Dracula',
    colorScheme: 'dark' as const,
    vars: {
      '--color-bg':           '#282a36',
      '--color-surface':      '#21222c',
      '--color-surface-high': '#343746',
      '--color-border-dim':   '#44475a',
      '--color-border':       '#6272a4',
      '--color-text':         '#f8f8f2',
      '--color-text-dim':     '#e2e2dc',
      '--color-muted':        '#b8b8b2',
      '--color-faint':        '#72758a',
      '--color-on-accent':    '#282a36',
      '--color-accent':       '#bd93f9',
      '--color-warn':         '#f1fa8c',
      '--color-danger':       '#ff5555',
      '--color-info':         '#8be9fd',
    },
  },
}

export type ThemeKey = keyof typeof THEMES

const DEFAULT_THEME: ThemeKey = 'oled'
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
  theme: DEFAULT_THEME,
  barWeight: DEFAULT_BAR_WEIGHT,
  plates: DEFAULT_PLATES,
  supplementalTemplate: 'fsl+bbb' as SupplementalTemplate,
  deloadSupplemental: 'normal' as DeloadSupplemental,
  hasDeloadWeek: true,
}

function resolveThemeKey(key: string | null | undefined): ThemeKey {
  if (key === 'dark') return 'oled'
  if (key === 'light') return 'oled-light'
  return key && key in THEMES ? key as ThemeKey : DEFAULT_THEME
}

export function applyTheme(key: string) {
  const theme = THEMES[resolveThemeKey(key)]
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
  deloadSupplemental: DeloadSupplemental
  hasDeloadWeek: boolean
}

export const [settings, setSettings] = createStore<SettingsState>({ ...SETTINGS_DEFAULTS })

export async function loadSettings() {
  const row = await db.settings.toCollection().first()
  if (!row) return
  setSettings({
    restTimer1: row.restTimer1,
    restTimer2: row.restTimer2,
    restTimerFail: row.restTimerFail,
    theme: resolveThemeKey(row.theme),
    barWeight: row.barWeight ?? DEFAULT_BAR_WEIGHT,
    plates: row.plates ?? DEFAULT_PLATES,
    supplementalTemplate: row.supplementalTemplate ?? 'fsl+bbb',
    deloadSupplemental: row.deloadSupplemental ?? 'normal',
    hasDeloadWeek: row.hasDeloadWeek ?? true,
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

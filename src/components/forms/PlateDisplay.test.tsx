// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import PlateDisplay from './PlateDisplay'
import { db } from '../../db'
import { __resetForTest } from '../../db/sqlite-client'
import { loadSettings, DEFAULT_PLATES } from '../../store/settings-store'
import type { PlateConfig } from '../../types/domain'

const BAR = { base: 45, mode: 'paired' as const }

const withPlates = async (plates: PlateConfig[]) => {
  await db.settings.clear()
  await db.settings.add({
    restTimer1: 90, restTimer2: 180, restTimerFail: 300,
    theme: 'dark', barWeight: 45, plates,
  })
  await loadSettings()
}

beforeEach(async () => {
  await __resetForTest()
  await withPlates(DEFAULT_PLATES)
})

describe('PlateDisplay', () => {
  it('lists the plates for a loadable weight', async () => {
    render(() => <PlateDisplay weight={185} loading={BAR} />)
    expect(screen.getByText(/each side: 45 · 25/)).toBeInTheDocument()
  })

  it('says "bar only" when the target is the bar itself', () => {
    render(() => <PlateDisplay weight={45} loading={BAR} />)
    expect(screen.getByText('bar only')).toBeInTheDocument()
  })

  // F27. `null` rendered nothing at all, so a weight the plate set cannot make
  // looked exactly like a set with no plate hint — the line just disappeared.
  it('says so when the weight cannot be made with the configured plates', async () => {
    await withPlates([{ weight: 45, count: 4 }])
    render(() => <PlateDisplay weight={100} loading={BAR} />)
    expect(screen.getByText(/not loadable with your plates/)).toBeInTheDocument()
  })

  it('says so when the target is below the bar', () => {
    render(() => <PlateDisplay weight={35} loading={BAR} />)
    expect(screen.getByText(/not loadable with your plates/)).toBeInTheDocument()
  })

  // F27. Greedy took the 45 and stranded 5; 25+25 was there all along.
  it('shows the exact load greedy selection used to miss', async () => {
    await withPlates([{ weight: 45, count: 2 }, { weight: 25, count: 4 }])
    render(() => <PlateDisplay weight={145} loading={BAR} />)
    expect(screen.getByText('each side: 25 · 25')).toBeInTheDocument()
  })

  it('labels a single stack differently from a pair of ends', async () => {
    render(() => <PlateDisplay weight={70} loading={{ base: 50, mode: 'total' }} />)
    expect(screen.getByText(/^plates: /)).toBeInTheDocument()
  })
})

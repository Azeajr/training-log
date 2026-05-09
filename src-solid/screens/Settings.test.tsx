import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { db } from '../../src/db/db'
import Settings from './Settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Settings', () => {
  it('shows theme section', async () => {
    render(() => <Settings />)
    expect(await screen.findByText(/THEME/i)).toBeInTheDocument()
  })

  it('shows default bar weight (45)', async () => {
    render(() => <Settings />)
    expect(await screen.findByText('45')).toBeInTheDocument()
  })

  it('shows plate config section', async () => {
    render(() => <Settings />)
    expect(await screen.findByText(/PLATES/i)).toBeInTheDocument()
  })
})

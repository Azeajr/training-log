import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../src/db/db'
import History from './History'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('History', () => {
  it('shows view mode toggle buttons', async () => {
    render(() => <Router><Route path="*" component={History} /></Router>)
    expect(await screen.findByText(/By lift/i)).toBeInTheDocument()
    expect(await screen.findByText(/By date/i)).toBeInTheDocument()
  })

  it('shows no session rows with empty DB', async () => {
    render(() => <Router><Route path="*" component={History} /></Router>)
    await screen.findByText(/By lift/i)
    expect(screen.queryByText(/W1/)).toBeNull()
  })

  it('switches to date mode on button click', async () => {
    render(() => <Router><Route path="*" component={History} /></Router>)
    const dateBtn = await screen.findByText(/By date/i)
    fireEvent.click(dateBtn)
    expect(screen.getByText(/By date/i)).toBeInTheDocument()
  })
})

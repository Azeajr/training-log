import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import UpdateBanner from './UpdateBanner'

describe('UpdateBanner', () => {
  it('renders nothing while no update is waiting', () => {
    render(() => <UpdateBanner ready={false} onApply={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers the update, and taking it applies it', () => {
    const onApply = vi.fn()
    render(() => <UpdateBanner ready={true} onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: /update ready/i }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })
})

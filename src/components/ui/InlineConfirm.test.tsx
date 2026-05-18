import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import InlineConfirm from './InlineConfirm'

describe('InlineConfirm', () => {
  it('renders trigger button', () => {
    const { getByText } = render(() => (
      <InlineConfirm label="undo" confirmText="undo set?" onConfirm={() => {}} />
    ))
    expect(getByText('undo')).toBeInTheDocument()
  })

  it('shows confirm state on trigger click', () => {
    const { getByText } = render(() => (
      <InlineConfirm label="undo" confirmText="undo set?" onConfirm={() => {}} />
    ))
    fireEvent.click(getByText('undo'))
    expect(getByText('undo set?')).toBeInTheDocument()
    expect(getByText('yes')).toBeInTheDocument()
    expect(getByText('no')).toBeInTheDocument()
  })

  it('calls onConfirm and returns to trigger on yes', () => {
    const onConfirm = vi.fn()
    const { getByText } = render(() => (
      <InlineConfirm label="undo" confirmText="undo set?" onConfirm={onConfirm} />
    ))
    fireEvent.click(getByText('undo'))
    fireEvent.click(getByText('yes'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(getByText('undo')).toBeInTheDocument()
  })

  it('does not call onConfirm and returns to trigger on no', () => {
    const onConfirm = vi.fn()
    const { getByText } = render(() => (
      <InlineConfirm label="undo" confirmText="undo set?" onConfirm={onConfirm} />
    ))
    fireEvent.click(getByText('undo'))
    fireEvent.click(getByText('no'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(getByText('undo')).toBeInTheDocument()
  })

  it('stopPropagation prevents parent click on trigger', () => {
    const parentClick = vi.fn()
    const { getByText } = render(() => (
      <div onClick={parentClick}>
        <InlineConfirm label="undo" confirmText="undo set?" onConfirm={() => {}} stopPropagation />
      </div>
    ))
    fireEvent.click(getByText('undo'))
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('stopPropagation prevents parent click on yes/no', () => {
    const parentClick = vi.fn()
    const { getByText } = render(() => (
      <div onClick={parentClick}>
        <InlineConfirm label="undo" confirmText="undo set?" onConfirm={() => {}} stopPropagation />
      </div>
    ))
    fireEvent.click(getByText('undo'))
    fireEvent.click(getByText('no'))
    expect(parentClick).not.toHaveBeenCalled()
  })
})

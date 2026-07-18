import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import NotesField from './NotesField'

// Controlled harness matching the component's contract: onInput echoes back
// into `value` synchronously and unmodified.
function setup(initial = '') {
  const [value, setValue] = createSignal(initial)
  const utils = render(() => (
    <NotesField value={value()} onInput={setValue} textareaClass="w-full" />
  ))
  const textarea = utils.container.querySelector('textarea') as HTMLTextAreaElement
  const chip = utils.getByText('• LIST')
  const caret = (pos: number) => textarea.setSelectionRange(pos, pos)
  return { value, textarea, chip, caret, ...utils }
}

describe('NotesField — list mode toggle', () => {
  it('starts a bullet on an empty line and shows the indent chips', () => {
    const { value, chip, caret, getByText } = setup('')
    caret(0)
    fireEvent.click(chip)
    expect(value()).toBe('- ')
    expect(getByText('←')).toBeInTheDocument()
    expect(getByText('→')).toBeInTheDocument()
  })

  it('toggling off strips the bullet from the caret line and hides the chips', () => {
    const { value, chip, caret, queryByText } = setup('')
    caret(0)
    fireEvent.click(chip)
    caret(2)
    fireEvent.click(chip)
    expect(value()).toBe('')
    expect(queryByText('←')).not.toBeInTheDocument()
  })

  it('enabling on an existing bullet line keeps the text unchanged', () => {
    const { value, chip, caret } = setup('- one')
    caret(5)
    fireEvent.click(chip)
    expect(value()).toBe('- one')
  })
})

describe('NotesField — Enter in list mode', () => {
  it('continues the bullet onto the next line at the same depth', () => {
    const { value, textarea, chip, caret } = setup('- one')
    caret(5)
    fireEvent.click(chip)
    caret(5)
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(value()).toBe('- one\n- ')
  })

  it('outdents an empty nested bullet by one level', () => {
    const { value, textarea, chip, caret } = setup('- a\n  - ')
    caret(8)
    fireEvent.click(chip)
    caret(8)
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(value()).toBe('- a\n- ')
  })

  it('deletes an empty top-level bullet and exits list mode', () => {
    const { value, textarea, chip, caret, queryByText } = setup('- a\n- ')
    caret(6)
    fireEvent.click(chip)
    caret(6)
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(value()).toBe('- a\n')
    expect(queryByText('←')).not.toBeInTheDocument()
  })
})

describe('NotesField — Tab / Shift+Tab', () => {
  it('Tab indents the bullet under the caret by one level', () => {
    const { value, textarea, caret } = setup('- a')
    caret(3)
    fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(value()).toBe('  - a')
  })

  it('Shift+Tab outdents a nested bullet by one level', () => {
    const { value, textarea, caret } = setup('  - a')
    caret(5)
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    expect(value()).toBe('- a')
  })

  it('Shift+Tab on a top-level bullet drops the bullet entirely', () => {
    const { value, textarea, caret } = setup('- a')
    caret(3)
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    expect(value()).toBe('a')
  })

  it('Tab on a non-bullet line is left to the browser (no text change)', () => {
    const { value, textarea, caret } = setup('plain')
    caret(5)
    fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(value()).toBe('plain')
  })
})

describe('NotesField — indent chips', () => {
  it('→ and ← mirror Tab and Shift+Tab for the caret line', () => {
    const { value, chip, caret, getByText } = setup('- a')
    caret(3)
    fireEvent.click(chip)
    caret(3)
    fireEvent.click(getByText('→'))
    expect(value()).toBe('  - a')
    fireEvent.click(getByText('←'))
    expect(value()).toBe('- a')
  })
})

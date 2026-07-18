import { describe, it, expect } from 'vitest'
import { render } from '@solidjs/testing-library'
import NotesText from './NotesText'

describe('NotesText — plain text', () => {
  it('renders each line as its own div', () => {
    const { container } = render(() => <NotesText text={'one\ntwo'} />)
    const lines = [...container.firstElementChild!.children]
    expect(lines.map(l => l.textContent)).toEqual(['one', 'two'])
  })

  it('renders a blank line as a non-collapsing nbsp so paragraph gaps survive', () => {
    const { container } = render(() => <NotesText text={'a\n\nb'} />)
    const lines = [...container.firstElementChild!.children]
    expect(lines).toHaveLength(3)
    expect(lines[1].textContent).toBe('\u00A0')
  })
})

describe('NotesText — bullet lists', () => {
  it('groups consecutive bullets into a single list', () => {
    const { container } = render(() => <NotesText text={'- one\n- two'} />)
    const uls = container.querySelectorAll('ul')
    expect(uls).toHaveLength(1)
    const items = [...uls[0].querySelectorAll('li')]
    expect(items.map(l => l.textContent)).toEqual(['one', 'two'])
  })

  it('nests two-space-indented bullets as a child list of the preceding bullet', () => {
    const { container } = render(() => <NotesText text={'- parent\n  - child\n- sibling'} />)
    const topUl = container.querySelector('ul')!
    expect(topUl.querySelectorAll(':scope > li')).toHaveLength(2)
    const nested = container.querySelector('li ul')!
    expect(nested.querySelector('li')!.textContent).toBe('child')
  })

  it('a same-depth bullet after a nested one pops back to the outer list', () => {
    const { container } = render(() => <NotesText text={'- a\n  - a1\n  - a2\n- b'} />)
    const topUl = container.querySelector('ul')!
    const topItems = topUl.querySelectorAll(':scope > li')
    expect(topItems).toHaveLength(2)
    expect(container.querySelector('li ul')!.querySelectorAll('li')).toHaveLength(2)
  })

  it('keeps text and list blocks in source order', () => {
    const { container } = render(() => <NotesText text={'intro\n- a\n- b\noutro'} />)
    const root = container.firstElementChild!
    const tags = [...root.children].map(c => c.tagName)
    expect(tags).toEqual(['DIV', 'UL', 'DIV'])
    expect(root.children[0].textContent).toBe('intro')
    expect(root.children[2].textContent).toBe('outro')
  })
})

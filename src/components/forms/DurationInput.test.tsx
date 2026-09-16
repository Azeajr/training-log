import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import DurationInput from './DurationInput'

// DurationInput renders two Steppers (mm then ss).
// getAllByRole('button') order:
//   [0]=mm−  [1]=mm-value  [2]=mm+  [3]=ss−  [4]=ss-value  [5]=ss+
// getAllByTestId('stepper-value') order: [0]=mm display  [1]=ss display

describe('DurationInput — initial render', () => {
  it('shows 0 : 0 when value is null', () => {
    const { getAllByTestId } = render(() => <DurationInput value={null} onChange={() => {}} />)
    const [mm, ss] = getAllByTestId('stepper-value')
    expect(mm.textContent).toBe('0')
    expect(ss.textContent).toBe('0')
  })

  it('parses seconds into mm and ss (90 s → 1:30)', () => {
    const { getAllByTestId } = render(() => <DurationInput value={90} onChange={() => {}} />)
    const [mm, ss] = getAllByTestId('stepper-value')
    expect(mm.textContent).toBe('1')
    expect(ss.textContent).toBe('30')
  })

  it('parses exact minutes (120 s → 2:00)', () => {
    const { getAllByTestId } = render(() => <DurationInput value={120} onChange={() => {}} />)
    const [mm, ss] = getAllByTestId('stepper-value')
    expect(mm.textContent).toBe('2')
    expect(ss.textContent).toBe('0')
  })
})

describe('DurationInput — interactions', () => {
  it('incrementing mm calls onChange with (mm+1)*60 + ss', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <DurationInput value={90} onChange={onChange} />) // 1:30
    fireEvent.click(getAllByRole('button')[2]) // mm +
    expect(onChange).toHaveBeenCalledWith(150) // 2*60+30
  })

  it('incrementing ss calls onChange with mm*60 + (ss+1)', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <DurationInput value={90} onChange={onChange} />) // 1:30
    fireEvent.click(getAllByRole('button')[5]) // ss +
    expect(onChange).toHaveBeenCalledWith(91) // 1*60+31
  })

  it('decrementing mm calls onChange with (mm-1)*60 + ss', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <DurationInput value={90} onChange={onChange} />) // 1:30
    fireEvent.click(getAllByRole('button')[0]) // mm −
    expect(onChange).toHaveBeenCalledWith(30) // 0*60+30
  })

  it('ss + is disabled when ss equals 59', () => {
    const { getAllByRole } = render(() => (
      <DurationInput value={3 * 60 + 59} onChange={() => {}} /> // 3:59
    ))
    expect(getAllByRole('button')[5]).toBeDisabled()
  })

  it('mm − is disabled when mm is 0', () => {
    const { getAllByRole } = render(() => <DurationInput value={30} onChange={() => {}} />) // 0:30
    expect(getAllByRole('button')[0]).toBeDisabled()
  })
})

// ── F59 ─────────────────────────────────────────────────────────────────────
// fieldLabel exists, per its own comment, "so two duration inputs on one screen
// don't both announce as bare 'minutes'/'seconds'" — and none of its three call
// sites passed it. In AccessoryLog the two are simultaneously on screen in the
// ordinary case: editing a logged timed set renders one while the active-set
// form renders the other.
describe('DurationInput fieldLabel (F59)', () => {
  it('prefixes the stepper names so two inputs are distinguishable', () => {
    const { container } = render(() => (
      <>
        <DurationInput value={90} onChange={() => {}} fieldLabel="set 1" />
        <DurationInput value={30} onChange={() => {}} fieldLabel="this set" />
      </>
    ))
    const names = [...container.querySelectorAll('[aria-label]')]
      .map(el => el.getAttribute('aria-label')!)
    expect(names).toContain('Increase set 1 minutes')
    expect(names).toContain('Increase this set minutes')
    // No two controls may share an accessible name.
    expect(new Set(names).size).toBe(names.length)
  })

  it('falls back to bare names when no fieldLabel is given', () => {
    const { container } = render(() => <DurationInput value={90} onChange={() => {}} />)
    const names = [...container.querySelectorAll('[aria-label]')]
      .map(el => el.getAttribute('aria-label')!)
    expect(names).toContain('Increase minutes')
  })
})

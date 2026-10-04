import { describe, it, expect } from 'vitest'
import { liftWeightFloor, resolveLiftLoading, resolveExerciseLoading } from './plate-loading'

const BAR = 45

describe('resolveLiftLoading', () => {
  it('defaults an untouched lift to paired at the global bar', () => {
    expect(resolveLiftLoading({}, BAR)).toEqual({ mode: 'paired', base: BAR })
  })

  it('legacy usesBarbell=false → no readout', () => {
    expect(resolveLiftLoading({ usesBarbell: false }, BAR)).toBeNull()
  })

  it('plateMode overrides the legacy usesBarbell flag', () => {
    expect(resolveLiftLoading({ usesBarbell: false, plateMode: 'paired' }, BAR))
      .toEqual({ mode: 'paired', base: BAR })
  })

  it('total with base 0 (belt squat)', () => {
    expect(resolveLiftLoading({ plateMode: 'total', implementBase: 0 }, BAR))
      .toEqual({ mode: 'total', base: 0 })
  })

  it('paired with an explicit base (hex bar) ignores the global bar', () => {
    expect(resolveLiftLoading({ plateMode: 'paired', implementBase: 55 }, BAR))
      .toEqual({ mode: 'paired', base: 55 })
  })

  it('plateMode none → null', () => {
    expect(resolveLiftLoading({ plateMode: 'none' }, BAR)).toBeNull()
  })

  it('null implementBase falls back to the mode default (total → 0)', () => {
    expect(resolveLiftLoading({ plateMode: 'total', implementBase: null }, BAR))
      .toEqual({ mode: 'total', base: 0 })
  })

  it('tracks the global bar when base is unset (paired default)', () => {
    expect(resolveLiftLoading({ plateMode: 'paired' }, 35)).toEqual({ mode: 'paired', base: 35 })
  })
})

describe('liftWeightFloor', () => {
  it('is the global bar for an untouched barbell lift', () => {
    expect(liftWeightFloor({}, BAR)).toBe(BAR)
  })

  it('is the lift\'s own base when one is set, including zero', () => {
    expect(liftWeightFloor({ plateMode: 'paired', implementBase: 0 }, BAR)).toBe(0)
    expect(liftWeightFloor({ plateMode: 'paired', implementBase: 55 }, BAR)).toBe(55)
    expect(liftWeightFloor({ plateMode: 'total' }, BAR)).toBe(0)
  })

  it('is zero for a lift that is not plate-loaded', () => {
    expect(liftWeightFloor({ plateMode: 'none' }, BAR)).toBe(0)
    expect(liftWeightFloor({ usesBarbell: false }, BAR)).toBe(0)
  })
})

describe('resolveExerciseLoading', () => {
  it('defaults an accessory to none (no readout)', () => {
    expect(resolveExerciseLoading({}, BAR)).toBeNull()
  })

  it('legacy usesBarbell=true → paired at the bar', () => {
    expect(resolveExerciseLoading({ usesBarbell: true }, BAR)).toEqual({ mode: 'paired', base: BAR })
  })

  it('plateMode total base 0 (dip belt / weighted pull-up)', () => {
    expect(resolveExerciseLoading({ plateMode: 'total', implementBase: 0 }, BAR))
      .toEqual({ mode: 'total', base: 0 })
  })

  it('two-sided plate cable: paired, base 0', () => {
    expect(resolveExerciseLoading({ plateMode: 'paired', implementBase: 0 }, BAR))
      .toEqual({ mode: 'paired', base: 0 })
  })
})

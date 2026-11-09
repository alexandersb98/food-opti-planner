import { describe, expect, it } from 'vitest'
import { DECIMALS, decimalsExample, parseDecimals } from './attributeFields'

describe('parseDecimals', () => {
  it('accepts whole numbers in the range', () => {
    expect(parseDecimals('0')).toBe(0)
    expect(parseDecimals('3')).toBe(3)
    expect(parseDecimals('6')).toBe(6)
  })

  it('refuses empty, fractional, out of range and non-numeric text', () => {
    for (const text of ['', '  ', '1.5', '-1', '7', 'abc']) expect(parseDecimals(text)).toBeNull()
  })

  it('has the library range', () => {
    expect(DECIMALS).toEqual({ min: 0, max: 6, default: 3 })
  })
})

describe('decimalsExample', () => {
  it('shows the smallest step with the unit, on one line', () => {
    expect(decimalsExample(1, 'g')).toBe('1 → 0.1 g')
    expect(decimalsExample(0, ' kcal ')).toBe('0 → 1 kcal')
  })

  it('leaves out a missing unit and is empty without decimals', () => {
    expect(decimalsExample(2, '')).toBe('2 → 0.01')
    expect(decimalsExample(null, 'g')).toBe('')
  })
})

import { expect, test } from 'vitest'
import { fraction, ONE } from './fractions'
import { attribute, conversion, ingredient } from './test-data'
import { portionTotals, roundedText } from './totals'

const energy = attribute({ id: 1, name: 'Energy', decimals: 0 })
const protein = attribute({ id: 2, name: 'Protein', decimals: 1 })
const oats = ingredient({
  id: 1,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
})
const egg = ingredient({ id: 2, name: 'Egg', basis: '1', values: [{ attribute_id: 2, value: '6.3' }] })

function totals(items: Parameters<typeof portionTotals>[0], attributes = [energy, protein]) {
  return Object.fromEntries(portionTotals(items, attributes))
}

test('each total is amount times value per basis, summed over the ingredients', () => {
  expect(totals([{ ingredient: oats, amount: '60' }])).toEqual({ 1: '233', 2: '10.1' })
  expect(
    totals([
      { ingredient: oats, amount: '60' },
      { ingredient: egg, amount: '2' },
    ]),
  ).toEqual({ 1: '233', 2: '22.7' })
})

test('a missing value counts as 0, and no ingredients total 0', () => {
  expect(totals([{ ingredient: egg, amount: '2' }])).toEqual({ 1: '0', 2: '12.6' })
  expect(totals([])).toEqual({ 1: '0', 2: '0' })
})

test('totals are exact before rounding half away from zero, as the server rounds', () => {
  const third = ingredient({ id: 3, name: 'Third', basis: '3', values: [{ attribute_id: 1, value: '1' }] })
  expect(totals([{ ingredient: third, amount: '300' }])).toEqual({ 1: '100', 2: '0' })
  const half = ingredient({
    id: 4,
    name: 'Half',
    basis: '1',
    values: [
      { attribute_id: 1, value: '0.5' },
      { attribute_id: 2, value: '-0.05' },
    ],
  })
  expect(totals([{ ingredient: half, amount: '1' }])).toEqual({ 1: '1', 2: '-0.1' })
  // 0.1 + 0.2 in floating point is 0.30000000000000004.
  const tenth = ingredient({ id: 5, name: 'Tenth', basis: '1', values: [{ attribute_id: 3, value: '0.1' }] })
  const salt = attribute({ id: 3, name: 'Salt', decimals: 6 })
  const both = [
    { ingredient: tenth, amount: '1' },
    { ingredient: tenth, amount: '2' },
  ]
  expect(totals(both, [salt])).toEqual({ 3: '0.3' })
})

test('small totals round to 0 without a sign, and decimals are padded inside', () => {
  const tiny = ingredient({ id: 6, name: 'Tiny', basis: '1', values: [{ attribute_id: 2, value: '-0.04' }] })
  expect(totals([{ ingredient: tiny, amount: '1' }])[2]).toBe('0')
  const salt = attribute({ id: 3, name: 'Salt', decimals: 3 })
  const pinch = ingredient({ id: 7, name: 'Pinch', basis: '100', values: [{ attribute_id: 3, value: '0.5' }] })
  expect(totals([{ ingredient: pinch, amount: '1.4' }], [salt])).toEqual({ 3: '0.007' })
})

test('a number is rounded to at most so many decimals, half away from zero', () => {
  expect(roundedText('270.004', 2)).toBe('270')
  expect(roundedText('2.555', 2)).toBe('2.56')
  expect(roundedText('-2.555', 2)).toBe('-2.56')
  expect(roundedText('80', 2)).toBe('80')
  expect(roundedText('0.001', 2)).toBe('0')
})

test('the total is divided by the servings once, after the lines are summed', () => {
  const lines = [
    { ingredient: oats, amount: '60' },
    { ingredient: oats, amount: '60' },
  ]
  expect(Object.fromEntries(portionTotals(lines, [energy, protein], 2))).toEqual({ 1: '233', 2: '10.1' })
  expect(totals(lines)).toEqual({ 1: '467', 2: '20.3' })
})

test('servings of 1 change nothing, and a rounding tie with servings rounds up as the server does', () => {
  expect(Object.fromEntries(portionTotals([{ ingredient: oats, amount: '60' }], [energy, protein], 1))).toEqual({
    1: '233',
    2: '10.1',
  })
  // 33 of a value of 1 per basis 3 is 11, served by 2 is exactly 5.5: 6.
  const third = ingredient({ id: 3, name: 'Third', basis: '3', values: [{ attribute_id: 1, value: '1' }] })
  expect(Object.fromEntries(portionTotals([{ ingredient: third, amount: '33' }], [energy], 2))).toEqual({ 1: '6' })
  expect(Object.fromEntries(portionTotals([{ ingredient: third, amount: '33' }], [energy], 3))).toEqual({ 1: '4' })
})

// Line units: each line is converted to its ingredient's own unit.

const grain = ingredient({
  id: 6,
  name: 'Grain',
  values: [{ attribute_id: 1, value: '389' }],
  conversions: [conversion({ id: 1, unit: 'dl', factor: '40' })],
})
const perUnit = (_: unknown, unit: string) => (unit === 'dl' ? fraction('40') : unit === '' ? ONE : null)
const withUnits = (items: Parameters<typeof portionTotals>[0], servings = 1) =>
  Object.fromEntries(portionTotals(items, [energy, protein], servings, perUnit))

test('a line in another unit is converted before the totals', () => {
  // 60 g and 1 dl of 40 g per dl is 100 g of 389 per 100 g.
  expect(
    withUnits([
      { ingredient: grain, amount: '60', unit: '' },
      { ingredient: grain, amount: '1', unit: 'dl' },
    ]),
  ).toEqual({ 1: '389', 2: '0' })
})

test('servings divide after the conversion', () => {
  expect(withUnits([{ ingredient: grain, amount: '2', unit: 'dl' }], 4)).toEqual({ 1: '78', 2: '0' })
})

test('a line that does not convert counts 0', () => {
  expect(withUnits([{ ingredient: grain, amount: '1', unit: 'pinch' }])).toEqual({ 1: '0', 2: '0' })
})

test('without units the totals are as before', () => {
  expect(totals([{ ingredient: oats, amount: '60', unit: '' }])).toEqual({ 1: '233', 2: '10.1' })
})

test('ties still round half away from zero with units', () => {
  const tie = ingredient({ id: 7, name: 'Tie', basis: '3', values: [{ attribute_id: 1, value: '1' }] })
  // 16.5 of a value of 1 per 3 is exactly 5.5, which rounds up.
  expect(withUnits([{ ingredient: tie, amount: '16.5', unit: '' }])).toEqual({ 1: '6', 2: '0' })
})

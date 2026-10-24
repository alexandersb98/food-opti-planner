import { expect, test } from 'vitest'
import { attribute, ingredient } from './test-data'
import { portionTotals } from './totals'

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

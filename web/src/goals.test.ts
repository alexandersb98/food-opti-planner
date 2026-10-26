import { expect, test } from 'vitest'
import { makeI18n } from './i18n'
import { IMPORTANCE, needsZeroReference, rangeText, scopeText } from './goals'

const { t } = makeI18n().global

test.each([
  ['1800', '2200', 'kcal', '1800–2200 kcal'],
  ['120', '120', 'g', 'exactly 120 g'],
  ['120.0', '120', 'g', 'exactly 120.0 g'],
  ['120', null, 'g', 'at least 120 g'],
  [null, '2200', 'kcal', 'at most 2200 kcal'],
  ['3', null, '', 'at least 3'],
])('the range %s to %s %s reads "%s"', (min, max, unit, text) => {
  expect(rangeText(min, max, unit, t)).toBe(text)
})

test('the scopes are named by message keys that read as the wireframe has them', () => {
  const names = (['day', 'plan_total', 'daily_average'] as const).map((scope) => t(scopeText(scope)))
  expect(names).toEqual(['Each day', 'Whole plan · total', 'Whole plan · daily average'])
})

test('importance runs from 1 to 5, starting on 3', () => {
  expect(IMPORTANCE).toEqual({ min: 1, max: 5, default: 3 })
})

test.each([
  ['day', false, '0', null, true], // Prefer with a zero bound
  ['day', true, '0', null, false], // Must needs no soft penalty
  ['plan_total', true, null, '0', false],
  ['plan_total', false, null, '0', true],
  ['daily_average', true, '0', null, true], // its day guard-rail is soft
  ['daily_average', true, null, '0', true],
  ['daily_average', true, '10', '20', false],
  ['day', false, '10', null, false],
  ['day', false, '0.0', null, true],
  ['day', false, '0,00', null, true],
  ['day', false, '0', '5', true],
  ['day', false, '', '', false],
  ['day', false, 'x', null, false],
] as const)('%s, must %s, bounds %s and %s: reference needed is %s', (applies_to, must, min, max, needed) => {
  expect(needsZeroReference({ applies_to, must, min, max })).toBe(needed)
})

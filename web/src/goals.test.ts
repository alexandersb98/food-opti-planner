import { describe, expect, test } from 'vitest'
import type { Goal } from './api/types'
import { makeI18n } from './i18n'
import { boundError, goalNames, guardRailImportance, IMPORTANCE, needsZeroReference, rangeText, scopeText } from './goals'
import { attribute } from './test-data'

const { t } = makeI18n().global
type AppliesTo = Goal['applies_to']

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
  ['day', false, '-5', null, true], // a negative bound would reward a miss
  ['plan_total', false, null, '-0.5', true],
  ['daily_average', true, '-5', null, true],
  ['day', true, '-5', null, false],
  ['plan_total', true, null, '-5', false],
  ['day', false, '', '', false],
  ['day', false, 'x', null, false],
] as const)('%s, must %s, bounds %s and %s: reference needed is %s', (applies_to, must, min, max, needed) => {
  expect(needsZeroReference({ applies_to, must, day_guard_rail: true, min, max })).toBe(needed)
})

test('without its day guard-rail, a Must daily average needs no reference; a Prefer one still does', () => {
  expect(needsZeroReference({ applies_to: 'daily_average', must: true, day_guard_rail: false, min: '0', max: null })).toBe(false)
  expect(needsZeroReference({ applies_to: 'daily_average', must: false, day_guard_rail: false, min: '0', max: null })).toBe(true)
})

// The same cases as the server's `translate.guard_rail_importance`, and more.
test.each([
  [false, 3, null, null, null, 2], // Prefer: one step below the goal's importance
  [false, 5, null, null, null, 4],
  [false, 1, null, null, null, 1], // at least 1
  [false, 3, 5, 1, null, 4], // with below and above: one step below the higher
  [false, 3, null, 5, null, 4], // a side without its own is the goal's
  [true, 3, null, null, null, 2], // Must: 2, whatever the hidden importance
  [true, 5, null, null, null, 2],
  [false, 3, null, null, 5, 5], // its own importance once set
  [true, 4, null, null, 1, 1],
] as const)(
  'must %s, importance %s, below %s, above %s, own %s: the day guard-rail has importance %s',
  (must, importance, importance_below, importance_above, own, shown) => {
    expect(
      guardRailImportance({ must, importance, importance_below, importance_above, guard_rail_importance: own }),
    ).toBe(shown)
  },
)

// The same cases as the server's `translate.goal_names` (tests/server/test_translate.py).
describe('goal names', () => {
  const attributes = [attribute({ id: 1, name: 'Energy' }), attribute({ id: 2, name: 'Protein' })]
  const ENERGY = 1
  const PROTEIN = 2
  const named = (attribute_id = ENERGY, applies_to: AppliesTo = 'day', custom_name: string | null = null) => ({
    attribute_id,
    applies_to,
    custom_name,
  })

  test('they say the scope', () => {
    const goals = [named(PROTEIN), named(PROTEIN, 'plan_total'), named(PROTEIN, 'daily_average')]
    expect(goalNames(goals, attributes)).toEqual(['Protein per day', 'Protein, plan total', 'Protein, daily average'])
  })

  test('a repeated name gets 2 then 3 in goal order', () => {
    const goals = [named(), named(PROTEIN), named(), named(ENERGY, 'plan_total'), named()]
    expect(goalNames(goals, attributes)).toEqual([
      'Energy per day',
      'Protein per day',
      'Energy per day (2)',
      'Energy, plan total',
      'Energy per day (3)',
    ])
  })

  test('a typed name is kept and the generated ones are numbered around it', () => {
    const goals = [named(), named(ENERGY, 'day', 'Energy per day'), named(ENERGY, 'day', 'Fuel'), named()]
    expect(goalNames(goals, attributes)).toEqual(['Energy per day (2)', 'Energy per day', 'Fuel', 'Energy per day (3)'])
  })

  test('a number taken by a typed name moves the generated name on', () => {
    const goals = [named(), named(), named(ENERGY, 'day', 'Energy per day (2)'), named()]
    expect(goalNames(goals, attributes)).toEqual([
      'Energy per day',
      'Energy per day (3)',
      'Energy per day (2)',
      'Energy per day (4)',
    ])
  })
})

test.each([
  [undefined, ''],
  ['no_bound', 'Give a minimum, a maximum or both.'],
  ['min_above_max', 'Must be at most the maximum.'],
  ['too_many_decimals', 'At most 1 decimals for Protein.'],
  ['decimal_parsing', 'A number, such as 120 or 1.5.'],
])('a bound the server refuses with %s says "%s"', (type, message) => {
  expect(boundError(type, { name: 'Protein', decimals: 1 }, t)).toBe(message)
})

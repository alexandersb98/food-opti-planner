import { expect, test } from 'vitest'
import { makeI18n } from './i18n'
import { dayLine, missRows, percentText } from './misses'
import { planResult, resultGoal, resultMiss } from './test-data'

const { t } = makeI18n().global

const energy = { name: 'Energy', unit: 'kcal', decimals: 0 }
const protein = { name: 'Protein', unit: 'g', decimals: 0 }
const cost = { name: 'Cost', unit: 'kr', decimals: 0 }
const fat = { name: 'Fat', unit: 'g', decimals: 0 }

/** A plan from Mon 21 Sep; every day has Energy 1900, Protein 100, Cost 50, Fat 30. */
function plan(fields: Parameters<typeof planResult>[0]) {
  return planResult({
    attributes: [energy, protein, cost, fat],
    day_totals: Array.from({ length: 7 }, () => ['1900', '100', '50', '30']),
    ...fields,
  })
}

test('percents are shown whole, with − below and + above', () => {
  expect(percentText('18', 'below')).toBe('−18%')
  expect(percentText('7.5', 'above')).toBe('+8%')
  expect(percentText('18.4', 'below')).toBe('−18%')
  expect(percentText('0.4', 'above')).toBe('+0%')
})

test('no goals and no misses give no rows', () => {
  expect(missRows(plan({ id: 1 }), t)).toEqual([])
})

test('a goal missed on days is one row with its worst day', () => {
  const rows = missRows(
    plan({
      id: 1,
      goals: [resultGoal({ name: 'Protein per day', attribute: 1, min: '120' })],
      misses: [
        resultMiss({ goal: 0, day: 1, bound: '120', actual: '110', amount: '10', percent: '8.3' }),
        resultMiss({ goal: 0, day: 4, bound: '120', actual: '98', amount: '22', percent: '18.3' }),
      ],
    }),
    t,
  )
  expect(rows).toEqual([
    { title: 'Protein per day · below on 2 days', worst: 'worst Fri 25: 98 of 120 g −18%' },
  ])
})

test('one day reads "on 1 day"', () => {
  const rows = missRows(
    plan({
      id: 1,
      goals: [resultGoal({ name: 'Protein per day', attribute: 1 })],
      misses: [resultMiss({ day: 1 })],
    }),
    t,
  )
  expect(rows[0]?.title).toBe('Protein per day · below on 1 day')
})

test('a tie for the worst miss goes to the earliest day', () => {
  const rows = missRows(
    plan({
      id: 1,
      goals: [resultGoal({ name: 'Protein per day', attribute: 1 })],
      misses: [resultMiss({ day: 2, percent: '10' }), resultMiss({ day: 3, percent: '10' })],
    }),
    t,
  )
  expect(rows[0]?.worst).toMatch(/^worst Wed 23: /)
})

test('rows follow goal order, below before above, and keep the whole plan apart from days', () => {
  const rows = missRows(
    plan({
      id: 1,
      goals: [
        resultGoal({ name: 'Cost, plan total', attribute: 2, applies_to: 'plan_total', min: null, max: '300' }),
        resultGoal({ name: 'Energy, daily average', attribute: 0, applies_to: 'daily_average', min: '2000' }),
      ],
      misses: [
        resultMiss({ goal: 0, day: null, side: 'above', bound: '300', actual: '350', amount: '50', percent: '16.7' }),
        resultMiss({ goal: 1, day: null, bound: '2000', actual: '1850', amount: '150', percent: '7.5' }),
        resultMiss({ goal: 1, day: 3, bound: '2000', actual: '1500', amount: '500', percent: '25' }),
      ],
    }),
    t,
  )
  expect(rows).toEqual([
    { title: 'Cost, plan total · above, whole plan', worst: '350 of 300 kr +17%' },
    { title: 'Energy, daily average · below, whole plan', worst: '1850 of 2000 kcal/day −8%' },
    { title: 'Energy, daily average · below on 1 day', worst: 'worst Thu 24: 1500 of 2000 kcal −25%' },
  ])
})

test('a goal missed on both sides gives a row for each, below first', () => {
  const rows = missRows(
    plan({
      id: 1,
      goals: [resultGoal({ name: 'Protein per day', attribute: 1, min: '100', max: '120' })],
      misses: [resultMiss({ day: 0, side: 'below' }), resultMiss({ day: 1, side: 'above', bound: '120', actual: '130', amount: '10', percent: '8.3' })],
    }),
    t,
  )
  expect(rows.map((row) => row.title)).toEqual([
    'Protein per day · below on 1 day',
    'Protein per day · above on 1 day',
  ])
})

test('the day line is the first three attributes when the plan has no goals', () => {
  expect(dayLine(plan({ id: 1 }), 0, t)).toEqual([
    { text: 'Energy 1900 kcal', missed: false },
    { text: 'Protein 100 g', missed: false },
    { text: 'Cost 50 kr', missed: false },
  ])
})

test('the day line shows the attributes with goals, in attribute order', () => {
  const goals = [resultGoal({ name: 'Fat per day', attribute: 3 }), resultGoal({ name: 'Protein per day', attribute: 1 })]
  expect(dayLine(plan({ id: 1, goals }), 0, t)).toEqual([
    { text: 'Protein 100 g', missed: false },
    { text: 'Fat 30 g', missed: false },
  ])
})

test('a value missed that day shows with its bound, the larger percent when missed twice', () => {
  const goals = [
    resultGoal({ name: 'Protein per day', attribute: 1, min: '120' }),
    resultGoal({ name: 'Protein, daily average', attribute: 1, applies_to: 'daily_average', min: '110' }),
    resultGoal({ name: 'Fat per day', attribute: 3 }),
  ]
  const misses = [
    resultMiss({ goal: 0, day: 2, bound: '120', actual: '98', percent: '18.3' }),
    resultMiss({ goal: 1, day: 2, bound: '110', actual: '98', percent: '10.9' }),
    resultMiss({ goal: 1, day: null, bound: '110', actual: '105', percent: '4.5' }),
    resultMiss({ goal: 2, day: 3 }),
  ]
  expect(dayLine(plan({ id: 1, goals, misses }), 2, t)).toEqual([
    { text: 'Protein 98 / 120 g', missed: true },
    { text: 'Fat 30 g', missed: false },
  ])
})

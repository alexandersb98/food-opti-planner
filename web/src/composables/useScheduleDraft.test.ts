import { expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { plan } from '../test-data'
import { planDraft, scheduleFields, scheduleRows, serverErrors, validDate, validDays } from './useScheduleDraft'

const { t } = makeI18n().global

/** Keys 0, 1, 2, … as the composable gives them. */
function keys() {
  let next = 0
  return () => next++
}

test.each([
  ['2026-09-21', '2026-09-21'],
  ['2024-02-29', '2024-02-29'], // a leap day
  ['2026-02-29', null],
  ['2026-13-01', null],
  ['2026-9-21', null],
  ['', null],
])('the start %s is the date %s', (text, date) => {
  expect(validDate(text)).toBe(date)
})

test.each([
  ['7', 7],
  [' 31 ', 31],
  ['1', 1],
  ['0', null],
  ['32', null],
  ['2.5', null],
  ['', null],
])('the days typed %s are %s', (text, days) => {
  expect(validDays(text)).toBe(days)
})

test('a row offers "all", then from one fewer than the planned meals down to none', () => {
  const draft = planDraft(plan({ days: 2, skips: [{ day: 1, meal: 2 }] }), keys())
  const rows = scheduleRows('2026-09-21', 2, draft.meals, draft.skipped)
  expect(rows.map(({ label, planned, choices }) => ({ label, planned, choices }))).toEqual([
    { label: 'Mon 21', planned: 3, choices: [null, 2, 1, 0] },
    { label: 'Tue 22', planned: 2, choices: [null, 1, 0] },
  ])
})

test('there are no rows without a start date', () => {
  expect(scheduleRows('', 3, [], new Set())).toEqual([])
})

test('the fields send the days asked for only, keeping skips with their meal', () => {
  const stored = plan({ days: 3, skips: [{ day: 0, meal: 1 }, { day: 2, meal: 2 }], minimums: [{ day: 2, at_least: 1 }] })
  const draft = planDraft(stored, keys())
  draft.meals.reverse() // Dinner, Lunch, Breakfast
  const fields = scheduleFields(stored, draft, '2026-10-01', 2)
  expect(fields).toMatchObject({
    start_date: '2026-10-01',
    days: 2,
    meals: [
      { id: 3, name: 'Dinner' },
      { id: 2, name: 'Lunch' },
      { id: 1, name: 'Breakfast' },
    ],
    skips: [{ day: 0, meal: 1 }], // Lunch; the skip on the third day is left out
    minimums: [], // so is its minimum
    solve_time_limit: 30,
  })
})

test("the server's refusals show on their fields, by meal key and by day", () => {
  const stored = plan({ minimums: [{ day: 4, at_least: 2 }] })
  const draft = planDraft(stored, keys())
  const fields = scheduleFields(stored, draft, stored.start_date, stored.days)
  const byField = { days: 'x', 'meals.1.name': 'duplicate', 'meals.2.name': 'missing', 'minimums.0.at_least': 'x' }
  expect(serverErrors(byField, draft.meals, fields, t)).toEqual({
    start: '',
    days: t('schedule.daysRange', { min: 1, max: 31 }),
    meals: { 1: t('schedule.nameInUse'), 2: t('common.nameRequired') },
    minimums: { 4: t('schedule.abovePlanned') },
    save: '',
  })
})

test('a refusal on no field shown says the save failed', () => {
  const stored = plan()
  const draft = planDraft(stored, keys())
  const fields = scheduleFields(stored, draft, stored.start_date, stored.days)
  expect(serverErrors({ goals: 'x' }, draft.meals, fields, t).save).toBe(t('common.saveFailed'))
})

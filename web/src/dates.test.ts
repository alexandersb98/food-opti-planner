import { expect, test } from 'vitest'
import { dateRange, dayLabel, daysBetween, localDate } from './dates'

test('days are labelled by weekday and day of the month, across a month end', () => {
  expect(dayLabel('2026-10-26', 0)).toBe('Mon 26')
  expect(dayLabel('2026-10-26', 5)).toBe('Sat 31')
  expect(dayLabel('2026-10-26', 6)).toBe('Sun 1')
  expect(dayLabel('2026-12-31', 1)).toBe('Fri 1')
})

test('a range in one month names the month once', () => {
  expect(dateRange('2026-09-21', 7)).toBe('Mon 21 – Sun 27 Sep')
  expect(dateRange('2026-10-21', 1)).toBe('Wed 21 Oct')
})

test('a range across two months names both', () => {
  expect(dateRange('2026-10-26', 7)).toBe('Mon 26 Oct – Sun 1 Nov')
  expect(dateRange('2026-12-28', 7)).toBe('Mon 28 Dec – Sun 3 Jan')
})

test('the local date is the browser clock’s day, not the UTC one', () => {
  expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  expect(localDate(new Date(2026, 10, 30, 0, 1))).toBe('2026-11-30')
  expect(localDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('days between dates count across month ends and daylight saving', () => {
  expect(daysBetween('2026-10-26', '2026-10-26')).toBe(0)
  expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
  expect(daysBetween('2026-10-26', '2026-10-20')).toBe(-6)
})

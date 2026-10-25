// Days of a plan in words, in English like the rest of the app: "Mon 21",
// "Mon 21 – Sun 27 Oct". Dates are "YYYY-MM-DD", as the server answers
// them; they are worked out in UTC, so the browser's time zone can't move
// a day.

const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
const month = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })

/** The plan's day `index` (from 0) counted from `start`. */
function day(start: string, index: number): Date {
  const [year, monthNumber, date] = start.split('-').map(Number)
  return new Date(Date.UTC(year!, monthNumber! - 1, date! + index))
}

function label(date: Date) {
  return `${weekday.format(date)} ${date.getUTCDate()}`
}

/** "Mon 21": the plan's day `index` (from 0), the plan starting on `start`. */
export function dayLabel(start: string, index: number): string {
  return label(day(start, index))
}

/** "Mon 21 – Sun 27 Oct", or "Mon 28 Oct – Sun 3 Nov" across a month end:
 * the dates of a plan of `days` days starting on `start`. */
export function dateRange(start: string, days: number): string {
  const first = day(start, 0)
  const last = day(start, days - 1)
  if (days <= 1) return `${label(first)} ${month.format(first)}`
  const sameMonth =
    first.getUTCMonth() === last.getUTCMonth() && first.getUTCFullYear() === last.getUTCFullYear()
  const from = sameMonth ? label(first) : `${label(first)} ${month.format(first)}`
  return `${from} – ${label(last)} ${month.format(last)}`
}

/** "2026-10-25": the browser's date today (or `now`'s), in its own time zone. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

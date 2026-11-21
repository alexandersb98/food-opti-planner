import type { PlanResult } from '../../../api/types'

// The Menu's words for dates and portions, in English like the rest of the
// app (R1). Plan dates are "YYYY-MM-DD" and worked out in UTC, so the
// browser's time zone can't move a day.

const weekdayName = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' })
const monthLong = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })
const monthShort = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })

/** The plan's day `index` (from 0), as a UTC date. */
export function planDay(start: string, index: number): Date {
  const [year, month, day] = start.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + index))
}

/** "Wednesday", "23", "Sep": a day of the plan in parts, for its heading. */
export function dayParts(start: string, index: number) {
  const date = planDay(start, index)
  return { weekday: weekdayName.format(date), day: date.getUTCDate(), month: monthShort.format(date) }
}

/** "21–27 September", or "28 Sep – 4 Oct" across a month end: the plan's
 * dates as the menu card prints them (D2). */
export function longRange(start: string, days: number): string {
  const first = planDay(start, 0)
  const last = planDay(start, Math.max(days, 1) - 1)
  if (days <= 1) return `${first.getUTCDate()} ${monthLong.format(first)}`
  if (first.getUTCMonth() === last.getUTCMonth() && first.getUTCFullYear() === last.getUTCFullYear())
    return `${first.getUTCDate()}–${last.getUTCDate()} ${monthLong.format(last)}`
  return `${first.getUTCDate()} ${monthShort.format(first)} – ${last.getUTCDate()} ${monthShort.format(last)}`
}

/** The ISO week the plan starts in. */
export function startWeek(start: string): number {
  const day = planDay(start, 0)
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/** Today's day in the plan (`today` is "YYYY-MM-DD"), or null when the plan
 * doesn't cover it. */
export function dayOf(plan: Pick<PlanResult, 'start_date' | 'days'>, today: string): number | null {
  const index = Math.round((planDay(today, 0).getTime() - planDay(plan.start_date, 0).getTime()) / 86_400_000)
  return index >= 0 && index < plan.days ? index : null
}

/** A whole number from the query below `below`, if it is one. */
export function queryIndex(text: string | null, below: number): number | null {
  const index = text !== null && /^\d+$/.test(text) ? Number(text) : null
  return index !== null && index < below ? index : null
}

import type { Plan } from '../../../api/types'
import type { Translate } from '../../../translator'

// The schedule grid's rules on the setup as saved: which cells are skipped,
// how many meals a day plans, and the "set" changes a tap or the day sheet
// sends through the plan-setup store (each one a function of the latest
// setup, never a toggle).

/** Whether the meal (by index) is skipped on the day (from 0). */
export function isSkipped(plan: Plan, day: number, meal: number): boolean {
  return plan.skips.some((skip) => skip.day === day && skip.meal === meal)
}

/** How many of the day's meals are planned (not skipped). */
export function plannedOn(plan: Plan, day: number): number {
  return plan.meals.filter((_, meal) => !isSkipped(plan, day, meal)).length
}

/** The day's "at least", or null for "all": no minimum. */
export function minimumOn(plan: Plan, day: number): number | null {
  return plan.minimums.find((minimum) => minimum.day === day)?.at_least ?? null
}

/** The day's minimum kept only while below the meals planned that day: one
 * that asks for every planned meal, or more, means "all" and is dropped. */
function keepMinimums(plan: Plan): Plan {
  const minimums = plan.minimums.filter(({ day, at_least }) => at_least < plannedOn(plan, day))
  return minimums.length === plan.minimums.length ? plan : { ...plan, minimums }
}

/** The setup with the cell skipped or planned, whatever it was. Skipping a
 * meal drops a minimum it leaves too high. */
export function setCell(plan: Plan, day: number, meal: number, skipped: boolean): Plan {
  const others = plan.skips.filter((skip) => skip.day !== day || skip.meal !== meal)
  const skips = skipped ? [...others, { day, meal }].sort((a, b) => a.day - b.day || a.meal - b.meal) : others
  return keepMinimums({ ...plan, skips })
}

/** The setup with the day's "at least" set; null, or every planned meal,
 * is "all". */
export function setMinimum(plan: Plan, day: number, atLeast: number | null): Plan {
  const others = plan.minimums.filter((minimum) => minimum.day !== day)
  const minimums =
    atLeast === null || atLeast >= plannedOn(plan, day)
      ? others
      : [...others, { day, at_least: atLeast }].sort((a, b) => a.day - b.day)
  return { ...plan, minimums }
}

/** The plan's day (from 0) in full words: "Monday 21 September", and its
 * weekday alone. Worked out in UTC, as the server's dates are. */
export function longDay(t: Translate, locale: string, start: string, index: number) {
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day! + index))
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date)
  const weekday = part({ weekday: 'long' })
  return {
    weekday,
    text: t('schedule.grid.date', {
      weekday,
      day: date.getUTCDate(),
      month: part({ month: 'long' }),
    }),
  }
}

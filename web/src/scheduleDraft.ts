import type { Plan, PlanFields as Fields } from './api/types'
import { dayLabel } from './dates'
import type { Translate } from './goals'
import { planFields } from './planFields'

// The schedule editor's draft rules: the start date, the number of days, the
// meals, the skipped cells and each day's minimum, how they are checked before
// saving and where the server's refusals show. Framework-neutral: the React
// hook (`app/pages/brief/useScheduleDraft`) wraps them.

/** The server's limits on the number of days. */
export const DAYS = { min: 1, max: 31 }

/** The server's limit on a meal's name. */
export const MEAL_NAME_LENGTH = 40

/** A meal's name as the meal names editor gives it back; `key` is the
 * draft meal's, null for a meal added there. */
export type MealName = { key: number | null; name: string }

export type DraftMeal = { key: number; id: number | null; name: string }

/** The schedule as edited. Meals have a key, which stays when they are
 * renamed or moved, so a skipped cell ("day:key") keeps its meal. Cells
 * and minimums of days beyond the number of days are kept while editing,
 * so lowering the number and raising it again loses nothing, but they are
 * not sent. */
export type ScheduleDraft = {
  start: string
  daysText: string
  meals: DraftMeal[]
  skipped: Set<string>
  minimums: (number | null)[] // by day; null is "all"
}

/** What is wrong, by field: the meals by key and the minimums by day. */
export type ScheduleErrors = {
  start: string
  days: string
  meals: Partial<Record<number, string>>
  minimums: Partial<Record<number, string>>
  save: string
}

/** A cell's key in the skipped set: its day and its meal's key. */
export function cellKey(day: number, mealKey: number): string {
  return `${day}:${mealKey}`
}

/** The date typed, if it is one: "YYYY-MM-DD", a real day. */
export function validDate(text: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.getUTCMonth() === month! - 1 && date.getUTCDate() === day ? text : null
}

/** The number of days typed, if a whole number within the limits. */
export function validDays(text: string): number | null {
  const typed = text.trim()
  const number = Number(typed)
  return /^\d+$/.test(typed) && number >= DAYS.min && number <= DAYS.max ? number : null
}

/** The grid's rows for `days` days from `start`: each day's label, whether
 * each meal is planned, how many are, and the At least choices offered. */
export function scheduleRows(start: string, days: number, meals: DraftMeal[], skipped: Set<string>) {
  return Array.from({ length: start ? days : 0 }, (_, day) => {
    const label = dayLabel(start, day)
    const cells = meals.map((meal) => ({ meal, planned: !skipped.has(cellKey(day, meal.key)) }))
    const planned = cells.filter((cell) => cell.planned).length
    // "all", then from one fewer than the planned meals down to none.
    const choices = [null, ...Array.from({ length: planned }, (_, i) => planned - 1 - i)]
    return { day, label, cells, planned, choices }
  })
}

/** The draft from the setup as loaded, giving meals keys from `nextKey`. */
export function planDraft(plan: Plan, nextKey: () => number): ScheduleDraft {
  const meals = plan.meals.map(({ id, name }) => ({ key: nextKey(), id, name }))
  const minimums: (number | null)[] = Array.from({ length: DAYS.max }, () => null)
  for (const { day, at_least } of plan.minimums) minimums[day] = at_least
  return {
    start: plan.start_date,
    daysText: String(plan.days),
    meals,
    skipped: new Set(plan.skips.map(({ day, meal }) => cellKey(day, meals[meal]!.key))),
    minimums,
  }
}

/** The fields to send for a valid `start` and number of days: the draft's
 * schedule for those days, the rest of the setup as `plan` had it. */
export function scheduleFields(plan: Plan, draft: ScheduleDraft, start: string, days: number): Fields {
  const rows = scheduleRows(start, days, draft.meals, draft.skipped)
  return {
    ...planFields(plan),
    start_date: start,
    days,
    meals: draft.meals.map(({ id, name }) => ({ id, name })),
    skips: rows.flatMap(({ day, cells }) => cells.flatMap(({ planned }, meal) => (planned ? [] : [{ day, meal }]))),
    minimums: rows.flatMap(({ day }) => {
      const atLeast = draft.minimums[day]
      return atLeast == null ? [] : [{ day, at_least: atLeast }]
    }),
  }
}

/** A field the server refuses, on its field; anything else just failed.
 * `fields` are those sent, `meals` the draft's, in the same order. */
export function serverErrors(
  byField: Partial<Record<string, string>>,
  meals: DraftMeal[],
  fields: Fields,
  t: Translate,
): ScheduleErrors {
  const errors: ScheduleErrors = { start: '', days: '', meals: {}, minimums: {}, save: '' }
  if (byField.start_date) errors.start = t('schedule.startInvalid', {})
  if (byField.days) errors.days = t('schedule.daysRange', DAYS)
  const nameMessages: Partial<Record<string, string>> = {
    duplicate: t('schedule.nameInUse', {}),
    string_too_long: t('schedule.nameTooLong', { max: MEAL_NAME_LENGTH }),
  }
  meals.forEach((meal, i) => {
    const type = byField[`meals.${i}.name`]
    if (type) errors.meals[meal.key] = nameMessages[type] ?? t('common.nameRequired', {})
  })
  fields.minimums.forEach(({ day }, i) => {
    if (byField[`minimums.${i}.at_least`]) errors.minimums[day] = t('schedule.abovePlanned', {})
  })
  const shown =
    errors.start || errors.days || Object.keys(errors.meals).length || Object.keys(errors.minimums).length
  if (!shown) errors.save = t('common.saveFailed', {})
  return errors
}

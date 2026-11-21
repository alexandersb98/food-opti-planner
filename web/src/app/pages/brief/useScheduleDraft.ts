import { useReducer } from 'react'
import type { Plan, PlanFields } from '../../../api/types'
import { planFields } from '../../../planFields'
import {
  DAYS,
  MEAL_NAME_LENGTH,
  planDraft,
  scheduleFields,
  validDate,
  validDays,
  type ScheduleDraft,
  type ScheduleErrors,
} from '../../../scheduleDraft'
import type { Translate } from '../../../translator'
import { keepMinimums } from './scheduleGrid'

// The schedule sheet's draft in React: the pure rules (`src/scheduleDraft`)
// held in a reducer. The sheet edits the start, the number of days and the
// meal names; the skipped cells and minimums come along from the setup,
// each cell keeping its meal (by key) while meals are renamed, moved and
// removed.

/** The most meals a day the server takes. */
export const MEALS_MAX = 8

const noErrors = (): ScheduleErrors => ({ start: '', days: '', meals: {}, minimums: {}, save: '' })

export interface ScheduleDraftState {
  draft: ScheduleDraft
  /** The last valid start date typed, which labels the range meanwhile. */
  shownStart: string
  errors: ScheduleErrors
  nextKey: number
}

export type ScheduleDraftAction =
  | { type: 'start'; text: string }
  | { type: 'days'; days: number }
  | { type: 'rename'; key: number; name: string }
  | { type: 'add' }
  | { type: 'move'; key: number; by: -1 | 1 }
  | { type: 'remove'; key: number }
  | { type: 'errors'; errors: ScheduleErrors }

export function initialState(plan: Plan): ScheduleDraftState {
  let nextKey = 0
  const draft = planDraft(plan, () => nextKey++)
  return { draft, shownStart: plan.start_date, errors: noErrors(), nextKey }
}

export function reducer(state: ScheduleDraftState, action: ScheduleDraftAction): ScheduleDraftState {
  const { draft, errors } = state
  switch (action.type) {
    case 'start':
      return {
        ...state,
        draft: { ...draft, start: action.text },
        shownStart: validDate(action.text) ?? state.shownStart,
        errors: { ...errors, start: '', save: '' },
      }
    case 'days': {
      const days = Math.min(DAYS.max, Math.max(DAYS.min, action.days))
      return { ...state, draft: { ...draft, daysText: String(days) }, errors: { ...errors, days: '', save: '' } }
    }
    case 'rename': {
      const meals = draft.meals.map((meal) => (meal.key === action.key ? { ...meal, name: action.name } : meal))
      return { ...state, draft: { ...draft, meals }, errors: withoutMeal(errors, action.key) }
    }
    case 'add':
      if (draft.meals.length >= MEALS_MAX) return state
      return {
        ...state,
        draft: { ...draft, meals: [...draft.meals, { key: state.nextKey, id: null, name: '' }] },
        nextKey: state.nextKey + 1,
        errors: { ...errors, save: '' },
      }
    case 'move': {
      const from = draft.meals.findIndex((meal) => meal.key === action.key)
      const to = from + action.by
      if (from < 0 || to < 0 || to >= draft.meals.length) return state
      const meals = [...draft.meals]
      const [meal] = meals.splice(from, 1)
      meals.splice(to, 0, meal!)
      return { ...state, draft: { ...draft, meals }, errors: { ...errors, save: '' } }
    }
    case 'remove': {
      if (draft.meals.length <= 1) return state
      const meals = draft.meals.filter((meal) => meal.key !== action.key)
      // The meal's cells go with it.
      const skipped = new Set([...draft.skipped].filter((cell) => cell.split(':')[1] !== String(action.key)))
      return { ...state, draft: { ...draft, meals, skipped }, errors: withoutMeal(errors, action.key) }
    }
    case 'errors':
      return { ...state, errors: action.errors }
  }
}

function withoutMeal(errors: ScheduleErrors, key: number): ScheduleErrors {
  const meals = { ...errors.meals }
  delete meals[key]
  return { ...errors, meals, save: '' }
}

/** What is wrong with the meal names, by meal key: none empty, none too
 * long, none given twice (the later one is marked). */
export function mealNameErrors(draft: ScheduleDraft, t: Translate): Partial<Record<number, string>> {
  const found: Partial<Record<number, string>> = {}
  const seen = new Set<string>()
  for (const { key, name: typed } of draft.meals) {
    const name = typed.trim()
    if (name === '') found[key] = t('common.nameRequired')
    else if (name.length > MEAL_NAME_LENGTH) found[key] = t('schedule.nameTooLong', { max: MEAL_NAME_LENGTH })
    else if (seen.has(name)) found[key] = t('schedule.nameInUse')
    seen.add(name)
  }
  return found
}

/** The setup with the schedule from the fields (start, days, meals, skips
 * and minimums), the rest as `plan` has it; a minimum left at or above its
 * day's planned meals (a meal removed) is dropped, as "all". A meal added
 * has no id until saved (`planFields` sends it as null). */
export function withSchedule(plan: Plan, fields: PlanFields): Plan {
  const { start_date, days, meals, skips, minimums } = fields
  return keepMinimums({ ...plan, start_date, days, meals: meals as Plan['meals'], skips, minimums })
}

/** The checked change: the fields as sent for `plan`, or the errors found. */
export type Checked = { fields: PlanFields; next: (latest: Plan) => Plan } | { errors: ScheduleErrors }

/** Checks the draft before saving: the start, the days and the names. */
export function check(plan: Plan, state: ScheduleDraftState, t: Translate): Checked {
  const { draft } = state
  const start = validDate(draft.start)
  const days = validDays(draft.daysText)
  const errors: ScheduleErrors = {
    ...noErrors(),
    start: start ? '' : t('schedule.startInvalid'),
    days: days === null ? t('schedule.daysRange', DAYS) : '',
    meals: mealNameErrors(draft, t),
  }
  if (!start || days === null || Object.keys(errors.meals).length) return { errors }
  const trimmed = { ...draft, meals: draft.meals.map((meal) => ({ ...meal, name: meal.name.trim() })) }
  const schedule = scheduleFields(plan, trimmed, start, days)
  return {
    fields: planFields(withSchedule(plan, schedule)),
    next: (latest) => withSchedule(latest, schedule),
  }
}

/** The schedule sheet's draft for one opening, from the setup as saved. */
export function useScheduleDraft(plan: Plan) {
  return useReducer(reducer, plan, initialState)
}

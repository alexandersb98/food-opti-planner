import type { Goal } from './api/types'
import { typedNumber } from './numbers'

// What the Goals card and the goal editor share: how a goal's range and
// scope read, its importance range, and when the zero-bound field applies.

type AppliesTo = Goal['applies_to']
type Translate = (key: string, named: Record<string, unknown>) => string

/** The importance a Prefer goal can have; a new goal starts on the default. */
export const IMPORTANCE = { min: 1, max: 5, default: 3 }

/** The message key naming where a goal applies: "Each day", "Whole plan · total". */
export function scopeText(appliesTo: AppliesTo): string {
  return `goals.scope.${appliesTo}`
}

/** "1800–2200 kcal", "exactly 120 g", "at least 120 g" or "at most 2200 kcal":
 * the bounds as stored, `null` for none. */
export function rangeText(min: string | null, max: string | null, unit: string, t: Translate): string {
  const text = (key: string, named: Record<string, string>) => t(`goals.range.${key}`, named).trim()
  if (min !== null && max !== null) {
    return Number(min) === Number(max)
      ? text('exactly', { value: min, unit })
      : text('between', { min, max, unit })
  }
  if (min !== null) return text('atLeast', { value: min, unit })
  return text('atMost', { value: max ?? '', unit })
}

/** Whether the library wants a reference: a bound is 0 and a soft penalty is
 * built from it. That is a Prefer goal, or a daily average, whose day
 * guard-rail is soft also for a Must goal (the server's rule). The bounds are
 * as stored or as typed; "0.0" is 0, a bound that is no number is not. */
export function needsZeroReference(goal: Pick<Goal, 'applies_to' | 'must'> & { min: string | null; max: string | null }): boolean {
  const soft = !goal.must || goal.applies_to === 'daily_average'
  const isZero = (bound: string | null) => {
    const number = bound === null ? null : typedNumber(bound)
    return number !== null && Number(number) === 0
  }
  return soft && (isZero(goal.min) || isZero(goal.max))
}

import type { Attribute, Goal, GoalFields } from './api/types'
import { typedNumber } from './numbers'

// What the Goals card and the goal editor share: how a goal's range and
// scope read, its importance range, its name, and when the zero-bound field
// and the day guard-rail's importance apply.

type AppliesTo = Goal['applies_to']
type Translate = (key: string, named: Record<string, unknown>) => string

/** The importance a Prefer goal can have; a new goal starts on the default. */
export const IMPORTANCE = { min: 1, max: 5, default: 3 }

/** The longest name a user can type for a goal (the server's limit). */
export const NAME_LENGTH = 100

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

/** Whether the library wants a reference: a bound is 0 or below and a soft
 * penalty is built from it (a negative bound would reward a miss). That is a
 * Prefer goal, or a daily average with its day guard-rail, which is soft also
 * for a Must goal (the server's rule). The bounds are as stored or as typed;
 * "0.0" is 0, a bound that is no number is not. */
export function needsZeroReference(
  goal: Pick<Goal, 'applies_to' | 'must' | 'day_guard_rail'> & { min: string | null; max: string | null },
): boolean {
  const soft = !goal.must || (goal.applies_to === 'daily_average' && goal.day_guard_rail)
  const isZeroOrBelow = (bound: string | null) => {
    const number = bound === null ? null : typedNumber(bound)
    return number !== null && Number(number) <= 0
  }
  return soft && (isZeroOrBelow(goal.min) || isZeroOrBelow(goal.max))
}

/** A daily average's day guard-rail importance: its own, or else one step
 * below the goal's (the higher side's, with importance below and above), at
 * least 1, for a Prefer goal, and 2 for a Must goal, whose importance is
 * hidden. The server weighs the guard-rail by the same rule
 * (`translate.guard_rail_importance`). */
export function guardRailImportance(
  goal: Pick<Goal, 'must' | 'importance' | 'importance_below' | 'importance_above' | 'guard_rail_importance'>,
): number {
  if (goal.guard_rail_importance != null) return goal.guard_rail_importance
  if (goal.must) return 2
  const higher = Math.max(goal.importance_below ?? goal.importance, goal.importance_above ?? goal.importance)
  return Math.max(IMPORTANCE.min, higher - 1)
}

/** What names a goal: its typed name, or what it tracks and where. */
export type NameInput = Pick<GoalFields, 'attribute_id' | 'applies_to' | 'custom_name'>

/** Each goal's name, in goal order, as the server gives it
 * (`translate.goal_names`): the one the user typed, or "Protein per day",
 * "Protein, plan total", "Protein, daily average". A generated name gets
 * " (2)" on its second use, " (3)" on its third, and skips any number whose
 * name is taken already, by a typed name or an earlier generated one. The
 * names are the server's, so they are not translated. */
export function goalNames(goals: NameInput[], attributes: Pick<Attribute, 'id' | 'name'>[]): string[] {
  const generated = ({ attribute_id, applies_to }: NameInput) => {
    const attribute = attributes.find(({ id }) => id === attribute_id)?.name ?? ''
    if (applies_to === 'plan_total') return `${attribute}, plan total`
    if (applies_to === 'daily_average') return `${attribute}, daily average`
    return `${attribute} per day`
  }
  const taken = new Set(goals.flatMap(({ custom_name }) => (custom_name == null ? [] : [custom_name])))
  const uses = new Map<string, number>()
  return goals.map((goal) => {
    if (goal.custom_name != null) return goal.custom_name
    const base = generated(goal)
    let n = uses.get(base) ?? 0
    let name: string
    do {
      n += 1
      name = n === 1 ? base : `${base} (${n})`
    } while (taken.has(name))
    uses.set(base, n)
    taken.add(name)
    return name
  })
}

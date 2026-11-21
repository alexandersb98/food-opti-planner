import type { Goal, GoalFields, Plan, PlanFields } from './api/types'

// Saving the plan setup. The server takes the setup whole (PUT /api/plan),
// so an editor of one part sends the rest back as it was loaded. This is the
// one place that knows which answered fields go back: answered-only ones,
// such as a goal's generated name, must not.

/** A goal as the server takes it back: without its answered name (its
 * typed one, `custom_name`, goes back). */
export function goalFields(goal: Goal): GoalFields {
  const { id, attribute_id, min, max, applies_to, must, importance, zero_reference } = goal
  const { custom_name, importance_below, importance_above, day_guard_rail, guard_rail_importance } = goal
  return {
    id,
    attribute_id,
    min,
    max,
    applies_to,
    must,
    importance,
    zero_reference,
    custom_name,
    importance_below,
    importance_above,
    day_guard_rail,
    guard_rail_importance,
  }
}

/** The setup as loaded, as the server takes it back. */
export function planFields(plan: Plan): PlanFields {
  const { start_date, days, meals, skips, minimums, goals, tag_filters, solve_time_limit } = plan
  return {
    start_date,
    days,
    meals: meals.map(({ id, name }) => ({ id, name })),
    skips,
    minimums,
    goals: goals.map(goalFields),
    tag_filters,
    solve_time_limit,
  }
}

import { ref } from 'vue'
import { api } from './api/client'
import { fieldErrors } from './api/errors'
import type { Goal, GoalFields, Plan, PlanFields } from './api/types'

// Saving the plan setup. The server takes the setup whole (PUT /api/plan),
// so an editor of one part sends the rest back as it was loaded. This is the
// one place that knows which answered fields go back: answered-only ones,
// such as a goal's generated name, must not.

/** A goal as the server takes it back: without its answered name. */
export function goalFields(goal: Goal): GoalFields {
  const { id, attribute_id, min, max, applies_to, must, importance, zero_reference } = goal
  return { id, attribute_id, min, max, applies_to, must, importance, zero_reference }
}

/** The setup as loaded, as the server takes it back. */
export function planFields(plan: Plan): PlanFields {
  const { start_date, days, meals, skips, minimums, goals, solve_time_limit } = plan
  return {
    start_date,
    days,
    meals: meals.map(({ id, name }) => ({ id, name })),
    skips,
    minimums,
    goals: goals.map(goalFields),
    solve_time_limit,
  }
}

/** Sending the setup: `savePlan(fields)` gives the saved setup, or null and
 * the server's errors by field (none when it failed otherwise or couldn't be
 * reached). `saving` is true while it is sent. */
export function useSavePlan() {
  const saving = ref(false)

  async function savePlan(fields: PlanFields): Promise<{ plan: Plan | null; errors: Partial<Record<string, string>> }> {
    saving.value = true
    try {
      const { data, error } = await api.PUT('/api/plan', { body: fields })
      return data ? { plan: data, errors: {} } : { plan: null, errors: fieldErrors(error) }
    } catch {
      return { plan: null, errors: {} }
    } finally {
      saving.value = false
    }
  }

  return { saving, savePlan }
}

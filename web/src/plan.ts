import { ref } from 'vue'
import { api } from './api/client'
import { fieldErrors } from './api/errors'
import type { Plan, PlanFields } from './api/types'

// Sending the plan setup in Vue; which fields go back is `./planFields`.

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

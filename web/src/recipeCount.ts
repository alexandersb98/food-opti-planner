import { ref } from 'vue'
import { api } from './api/client'
import type { RecipeCount, TagFilter } from './api/types'

/** How many recipes a plan with these filters could use. `ask(filters)`
 * asks the server; an answer to an earlier question that arrives after a
 * later one is dropped. While a count is asked the previous one stays;
 * `failed` is set when the last question got no count. */
export function useRecipeCount() {
  const count = ref<RecipeCount | null>(null)
  const failed = ref(false)
  let latest = 0

  async function ask(filters: TagFilter[]) {
    const question = ++latest
    let answer: RecipeCount | undefined
    try {
      answer = (await api.POST('/api/plan/recipe-count', { body: { tag_filters: filters } })).data
    } catch {
      answer = undefined
    }
    if (question !== latest) return
    failed.value = !answer
    if (answer) count.value = answer
  }

  return { count, failed, ask }
}

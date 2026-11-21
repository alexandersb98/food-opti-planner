import { api } from '../../api/client'
import type { RecipeCount, TagFilter } from '../../api/types'
import { latestQuestion } from '../../latest'
import { createState } from './state'

// How many recipes a plan with these filters could use, asked of the server
// with "the latest question wins": an answer to an earlier question that
// arrives after a later one is dropped. One per reader (the filters sheet),
// not shared, so there is nothing to reset between tests. A port of the Vue
// `useRecipeCount`.

export interface RecipeCountState {
  /** The last count answered; it stays while a new one is asked. */
  count: RecipeCount | null
  /** The last question got no count. */
  failed: boolean
}

export type RecipeCountStore = ReturnType<typeof createRecipeCount>

export function createRecipeCount() {
  const state = createState<RecipeCountState>({ count: null, failed: false })
  const next = latestQuestion()

  /** Ask the count for `filters`; resolves when its answer is in (or dropped). */
  async function ask(filters: TagFilter[]): Promise<void> {
    const isLatest = next()
    let answer: RecipeCount | undefined
    try {
      answer = (await api.POST('/api/plan/recipe-count', { body: { tag_filters: filters } })).data
    } catch {
      answer = undefined
    }
    if (!isLatest()) return
    state.update(answer ? { count: answer, failed: false } : { failed: true })
  }

  return { subscribe: state.subscribe, getSnapshot: state.getSnapshot, ask }
}

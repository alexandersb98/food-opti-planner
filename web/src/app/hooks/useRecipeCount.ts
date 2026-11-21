import { useState, useSyncExternalStore } from 'react'
import type { TagFilter } from '../../api/types'
import { createRecipeCount, type RecipeCountState } from '../stores/recipeCount'

/** How many recipes these filters leave, for one reader: `ask(filters)`
 * asks again, and an answer that arrives after a later question is dropped. */
export function useRecipeCount(): RecipeCountState & { ask: (filters: TagFilter[]) => Promise<void> } {
  const [store] = useState(createRecipeCount)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { ...state, ask: store.ask }
}

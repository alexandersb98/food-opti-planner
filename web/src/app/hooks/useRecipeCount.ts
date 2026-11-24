import { useState, useSyncExternalStore } from 'react'
import type { TagFilter } from '../../api/types'
import { createRecipeCount, type RecipeCountState } from '../stores/recipeCount'

/** A reader's count and its `ask`. */
export type RecipeCountReader = RecipeCountState & { ask: (filters: TagFilter[]) => Promise<void> }

/** How many recipes these filters leave, for one reader: `ask(filters)`
 * asks again, and an answer that arrives after a later question is dropped. */
export function useRecipeCount(): RecipeCountReader {
  const [store] = useState(createRecipeCount)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { ...state, ask: store.ask }
}

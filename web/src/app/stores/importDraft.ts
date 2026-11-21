import type { ImportedRecipe } from '../../api/types'
import { createState } from './state'

// The hand-over from the import page to the recipe spread: the import page
// puts the server's draft here and goes to /recipes/new, which takes it. In
// memory only: a reload opens an empty new recipe, as nothing is stored until
// Save.

const state = createState<ImportedRecipe | null>(null)

export const importDraftStore = {
  subscribe: state.subscribe,
  /** The draft waiting to be taken, without taking it. */
  getSnapshot: state.getSnapshot,
  /** Leave a draft for the recipe spread (null clears an old one). */
  put: (recipe: ImportedRecipe | null) => state.set(recipe),
  /** The draft, once: it is cleared as it is taken. */
  take(): ImportedRecipe | null {
    const taken = state.getSnapshot()
    state.set(null)
    return taken
  },
  reset: () => state.set(null),
}

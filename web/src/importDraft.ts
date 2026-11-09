import { shallowRef } from 'vue'
import type { ImportedRecipe } from './api/types'

// The hand-off from the import page (I1) to the recipe editor (C2): I1 puts
// the server's draft here and goes to /recipes/new, which takes it. In
// memory only: a reload opens an empty new recipe, as nothing is stored until
// Save.
const draft = shallowRef<ImportedRecipe | null>(null)

export function setImportedDraft(recipe: ImportedRecipe | null) {
  draft.value = recipe
}

/** The draft, once: it is cleared as it is taken. */
export function takeImportedDraft(): ImportedRecipe | null {
  const taken = draft.value
  draft.value = null
  return taken
}

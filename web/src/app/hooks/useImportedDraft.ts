import { useEffect, useState } from 'react'
import type { ImportedRecipe } from '../../api/types'
import { importDraftStore } from '../stores/importDraft'

/** The imported draft left for this mount of the recipe spread, taken once:
 * read on the first render and cleared from the store after mounting. (Not
 * taken during render, as React may render twice, e.g. in StrictMode.) */
export function useImportedDraft(): ImportedRecipe | null {
  const [draft] = useState(importDraftStore.getSnapshot)
  useEffect(() => {
    importDraftStore.take()
  }, [])
  return draft
}

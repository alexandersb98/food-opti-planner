import { pendingKey, type PendingConversion } from '../../../importReview'
import type { DraftLine, RecipeDraft } from '../../../recipeDraft'

// The import review's changes to a recipe draft, as pure functions of the
// draft (for useRecipeDraft's `edit` action), next to the line editor's in
// `lineEdits.ts`. Lines are found by their key.

function changeLine(draft: RecipeDraft, key: number, change: (line: DraftLine) => DraftLine): RecipeDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.items.some((line) => line.key === key)
        ? { ...section, items: section.items.map((line) => (line.key === key ? change(line) : line)) }
        : section,
    ),
  }
}

/** Match a line with an ingredient, in `unit` ('' for the ingredient's own).
 * A number the AI gave was for the text's own ingredient and unit, so it goes. */
export function matchLine(draft: RecipeDraft, key: number, ingredientId: number, unit: string): RecipeDraft {
  return changeLine(draft, key, (line) => ({
    ...line,
    ingredientId,
    unit,
    suggestedFactor: null,
    suggestedUnit: undefined,
  }))
}

/** Leave a line out of the save, or put it back. */
export function skipLine(draft: RecipeDraft, key: number, skipped: boolean): RecipeDraft {
  return changeLine(draft, key, (line) => ({ ...line, skipped }))
}

/** Forget the accepted conversion for an ingredient and unit. */
export function forgetFactor(draft: RecipeDraft, ingredientId: number, unit: string): RecipeDraft {
  const key = pendingKey(ingredientId, unit)
  return { ...draft, pending: draft.pending.filter((p) => pendingKey(p.ingredientId, p.unit) !== key) }
}

/** Accept a conversion, "1 `unit` = `factor` of the ingredient's own unit",
 * created with the recipe; it replaces an earlier one for the same pair. */
export function acceptFactor(draft: RecipeDraft, accepted: PendingConversion): RecipeDraft {
  const rest = forgetFactor(draft, accepted.ingredientId, accepted.unit)
  return { ...rest, pending: [...rest.pending, accepted] }
}

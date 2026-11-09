import type { Conversion, Ingredient } from './api/types'
import { fraction, same } from './fractions'
import { lineFactor, type Ratio } from './lineUnits'
import { typedNumber } from './numbers'

// The import review on C2: what state each imported line is in, worked out
// on the client from the draft and the ingredients (with the conversions the
// user accepted and the save will create), so a hand match, a unit change or
// an accepted factor changes the state at once. The server's `status` is the
// first classification only. Pure: `ratio` is `useUnits().ratio`.

/** A conversion accepted on the review, created when the recipe is saved. */
export type PendingConversion = { ingredientId: number; unit: string; factor: string; source: 'ai' | 'user' }

export type LineState = 'ready' | 'skipped' | 'unmatched' | 'needs_factor' | 'bad_unit'

type Reviewed = { skipped: boolean; ingredientId: number | null; unit: string }

/** The key a pending conversion goes by: its ingredient and its unit,
 * ignoring case. */
export function pendingKey(ingredientId: number, unit: string): string {
  return `${ingredientId}:${unit.trim().toLowerCase()}`
}

/** The ingredient with the pending conversions of its units added, so
 * `lineFactor` sees them (id -1: they are not stored yet). */
export function ingredientWithPending(ingredient: Ingredient, pending: readonly PendingConversion[]): Ingredient {
  const added: Conversion[] = pending
    .filter((p) => p.ingredientId === ingredient.id)
    .map((p) => ({ id: -1, unit: p.unit, factor: p.factor, source: p.source, recipe_count: 0 }))
  return added.length === 0 ? ingredient : { ...ingredient, conversions: [...ingredient.conversions, ...added] }
}

/** An energy unit can never route, and a conversion for it is refused. */
function isEnergy(ratio: Ratio, unit: string): boolean {
  return ['kcal', 'kj'].some((energy) => ratio(unit, energy) !== null)
}

export function lineState(
  line: Reviewed,
  ingredient: Ingredient | undefined,
  pending: readonly PendingConversion[],
  ratio: Ratio,
): LineState {
  if (line.skipped) return 'skipped'
  if (line.ingredientId === null || !ingredient) return 'unmatched'
  if (line.unit.trim() === '') return 'ready'
  if (isEnergy(ratio, line.unit)) return 'bad_unit'
  return lineFactor(ratio, ingredientWithPending(ingredient, pending), line.unit) !== null ? 'ready' : 'needs_factor'
}

/** How many lines need the user: unmatched, needing a factor or a bad unit. */
export function needsYou(
  lines: readonly Reviewed[],
  ingredients: ReadonlyMap<number, Ingredient>,
  pending: readonly PendingConversion[],
  ratio: Ratio,
): number {
  return lines.filter((line) => {
    const state = lineState(line, line.ingredientId === null ? undefined : ingredients.get(line.ingredientId), pending, ratio)
    return state === 'unmatched' || state === 'needs_factor' || state === 'bad_unit'
  }).length
}

/** A factor as typed, if it can be accepted: above 0, at most 9 digits
 * before the point and 6 after. Null otherwise. */
export function acceptable(text: string): string | null {
  const number = typedNumber(text)
  if (number === null || !/^\d{1,9}(\.\d{0,6})?$|^\.\d{1,6}$/.test(number)) return null
  return Number(number) > 0 ? number : null
}

/** "ai" while the number is the AI's suggestion (numerically: 100.0 is 100),
 * else "user". */
export function factorSource(text: string, suggested: string | null): 'ai' | 'user' {
  const typed = typedNumber(text)
  if (typed === null || suggested === null) return 'user'
  return same(fraction(typed), fraction(suggested)) ? 'ai' : 'user'
}

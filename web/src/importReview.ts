import type { InjectionKey } from 'vue'
import type { Conversion, Ingredient } from './api/types'
import type { DraftLine } from './composables/useRecipeDraft'
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

/** The site a link names, for the banner: its host in lower case without a
 * leading "www."; empty for anything that is not an http or https link. */
export function siteName(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
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

/** The AI's number for a line's ingredient and unit: from a line (this one or
 * another) whose suggestion was made for that very unit, so a line whose unit
 * changed does not keep a number that was for the old one. */
export function suggestedFactorFor(
  line: Pick<DraftLine, 'ingredientId' | 'unit'>,
  lines: readonly Pick<DraftLine, 'ingredientId' | 'unit' | 'suggestedFactor' | 'suggestedUnit'>[],
): string | null {
  if (line.ingredientId === null) return null
  const key = pendingKey(line.ingredientId, line.unit)
  const found = lines.find(
    (other) =>
      other.ingredientId !== null &&
      other.suggestedFactor !== null &&
      pendingKey(other.ingredientId, other.suggestedUnit ?? other.unit) === key,
  )
  return found?.suggestedFactor ?? null
}

/** "ai" while the number is the AI's suggestion (numerically: 100.0 is 100),
 * else "user". */
export function factorSource(text: string, suggested: string | null): 'ai' | 'user' {
  const typed = typedNumber(text)
  if (typed === null || suggested === null) return 'user'
  return same(fraction(typed), fraction(suggested)) ? 'ai' : 'user'
}

/** The factor row of a line: the number as typed (or accepted), whether it is
 * the AI's suggestion as it was, whether a suggestion is on its way, and
 * whether it was accepted. */
export type FactorRow = { text: string; ai: boolean; loading: boolean; accepted: boolean }

/** What the recipe editor page gives its sections while an imported recipe
 * is under review (a section injects it; a normal editor provides none). The
 * numbers are the section's and the line's place in it. */
export type ImportReview = {
  state(line: DraftLine): LineState
  factor(line: DraftLine): FactorRow | null
  pick(section: number, line: number): void
  skip(section: number, line: number): void
  unskip(section: number, line: number): void
  accept(section: number, line: number, text: string): void
  change(section: number, line: number): void
  factorInput(section: number, line: number, text: string): void
}

export const importReviewKey: InjectionKey<ImportReview> = Symbol('importReview')

import type { Attribute, Ingredient } from './api/types'
import { add, fraction, ONE, type Fraction } from './fractions'

// A recipe's per-portion totals, worked out in the editor as the user types
// (C2): the whole recipe's lines, each in its ingredient's own unit, summed,
// divided by the servings. Exact, with the server's rounding, so the editor
// and the recipe list always show the same numbers.

/** Rounded to `decimals` places, half away from zero, without trailing
 * zeros: "233", "10.1", "-0.01". */
function rounded({ num, den }: Fraction, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const magnitude = num < 0n ? -num : num
  const units = (2n * magnitude * scale + den) / (2n * den)
  if (units === 0n) return '0'
  const digits = units.toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const after = digits.slice(digits.length - decimals).replace(/0+$/, '')
  return `${num < 0n ? '-' : ''}${whole}${after ? `.${after}` : ''}`
}

/** An amount of an ingredient, as typed: a plain decimal number, in `unit`
 * (empty or missing: the ingredient's own). */
export type Amount = { ingredient: Ingredient; amount: string; unit?: string }

/** What one of `unit` makes of the ingredient's own unit, or null when it
 * doesn't convert (`lineFactor`). */
export type FactorOf = (ingredient: Ingredient, unit: string) => Fraction | null

/** Each attribute's total for one portion, by attribute id: amount (in the
 * ingredient's own unit, by `factorOf`; a line that doesn't convert counts 0)
 * times value per basis, summed over all lines (amounts are for the whole
 * recipe) and divided by `servings` once; a missing value counts as 0. */
export function portionTotals(
  items: readonly Amount[],
  attributes: readonly Attribute[],
  servings = 1,
  factorOf: FactorOf = () => ONE,
) {
  const totals = new Map<number, string>()
  for (const attribute of attributes) {
    let sum: Fraction = { num: 0n, den: 1n }
    for (const { ingredient, amount, unit = '' } of items) {
      const value = ingredient.values.find((v) => v.attribute_id === attribute.id)
      const factor = factorOf(ingredient, unit)
      if (!value || !factor) continue
      const [a, v, basis] = [fraction(amount), fraction(value.value), fraction(ingredient.basis)]
      sum = add(sum, {
        num: a.num * factor.num * v.num * basis.den,
        den: a.den * factor.den * v.den * basis.num,
      })
    }
    totals.set(attribute.id, rounded({ num: sum.num, den: sum.den * BigInt(servings) }, attribute.decimals))
  }
  return totals
}

/** A plain decimal number rounded to at most `decimals` places, half away
 * from zero, without trailing zeros: "270.004" to 2 places is "270". */
export function roundedText(text: string, decimals: number): string {
  return rounded(fraction(text), decimals)
}

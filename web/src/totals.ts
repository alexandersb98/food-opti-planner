import type { Attribute, Ingredient } from './api/types'

// A recipe's per-portion totals, worked out in the editor as the user types
// (C2). Exact, with the server's rounding, so the editor and the recipe
// list always show the same numbers.

/** A fraction of whole numbers; `den` is above 0. */
type Fraction = { num: bigint; den: bigint }

/** "16.9" as 169/10. The text must be a plain decimal number. */
function fraction(text: string): Fraction {
  const negative = text.startsWith('-')
  const [whole = '', decimals = ''] = text.replace('-', '').split('.')
  const num = BigInt(`${whole}${decimals}` || '0')
  return { num: negative ? -num : num, den: 10n ** BigInt(decimals.length) }
}

function add(a: Fraction, b: Fraction): Fraction {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den }
}

/** Rounded to `decimals` places, half away from zero, without trailing
 * zeros: "233", "10.1", "-0.01". */
function rounded({ num, den }: Fraction, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const magnitude = num < 0n ? -num : num
  const units = (2n * magnitude * scale + den) / (2n * den)
  if (units === 0n) return '0'
  const digits = units.toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '')
  return `${num < 0n ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** An amount of an ingredient, as typed: a plain decimal number. */
export type Amount = { ingredient: Ingredient; amount: string }

/** Each attribute's total for one portion, by attribute id: amount times
 * value per basis, summed; a missing value counts as 0. */
export function portionTotals(items: readonly Amount[], attributes: readonly Attribute[]) {
  const totals = new Map<number, string>()
  for (const attribute of attributes) {
    let sum: Fraction = { num: 0n, den: 1n }
    for (const { ingredient, amount } of items) {
      const value = ingredient.values.find((v) => v.attribute_id === attribute.id)
      if (!value) continue
      const [a, v, basis] = [fraction(amount), fraction(value.value), fraction(ingredient.basis)]
      sum = add(sum, { num: a.num * v.num * basis.den, den: a.den * v.den * basis.num })
    }
    totals.set(attribute.id, rounded(sum, attribute.decimals))
  }
  return totals
}

// Exact arithmetic on fractions of whole numbers, for the totals and the unit
// conversions the editor works out as the user types: the server sums the
// same way (Python's Fraction), so both always agree.

/** A fraction of whole numbers; `den` is above 0. */
export type Fraction = { num: bigint; den: bigint }

export const ONE: Fraction = { num: 1n, den: 1n }

/** "16.9" as 169/10. The text must be a plain decimal number. */
export function fraction(text: string): Fraction {
  const negative = text.startsWith('-')
  const [whole = '', decimals = ''] = text.replace('-', '').split('.')
  const num = BigInt(`${whole}${decimals}` || '0')
  return { num: negative ? -num : num, den: 10n ** BigInt(decimals.length) }
}

export function add(a: Fraction, b: Fraction): Fraction {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den }
}

export function times(a: Fraction, b: Fraction): Fraction {
  return { num: a.num * b.num, den: a.den * b.den }
}

/** `a` divided by `b`, which is not 0. */
export function over(a: Fraction, b: Fraction): Fraction {
  const num = a.num * b.den
  const den = a.den * b.num
  return den < 0n ? { num: -num, den: -den } : { num, den }
}

/** Whether two fractions are the same number. */
export function same(a: Fraction | null, b: Fraction | null): boolean {
  return a !== null && b !== null && a.num * b.den === b.num * a.den
}

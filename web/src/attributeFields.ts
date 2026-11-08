// The attribute form's rules, shared by every place that edits an attribute.

/** The library's precision range, and its default for a new attribute. */
export const DECIMALS = { min: 0, max: 6, default: 3 }

/** The decimals as typed, or null if it is empty or not a whole number in range. */
export function parseDecimals(text: string): number | null {
  const decimals = Number(text)
  const valid =
    String(text).trim() !== '' &&
    Number.isInteger(decimals) &&
    decimals >= DECIMALS.min &&
    decimals <= DECIMALS.max
  return valid ? decimals : null
}

/** "1 → 0.1 g": the smallest step the planner counts, for the typed decimals. */
export function decimalsExample(decimals: number | null, unit: string): string {
  if (decimals === null) return ''
  const step = (10 ** -decimals).toFixed(decimals)
  return `${decimals} → ${step} ${unit.trim()}`.trim().replaceAll(' ', ' ') // kept on one line
}

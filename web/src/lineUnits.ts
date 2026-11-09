import type { CatalogueUnit, Conversion, Ingredient } from './api/types'
import { fraction, ONE, same, times, type Fraction } from './fractions'

// What the unit of a recipe line means for its ingredient (C2): the server's
// rule (`server/line_units.py`) in one place, so the picker, the live totals
// and the check before saving agree with the server. The unit catalogue is
// the only unit table: `ratio` is `useUnits().ratio`, given as a parameter so
// this file needs no catalogue to be tested.

/** What one `from` makes of `to`, or null (the catalogue's `ratio`). */
export type Ratio = (from: string, to: string) => Fraction | null

type Stored = Pick<Conversion, 'unit' | 'factor'>

/** Whether the line is in the ingredient's own unit (an empty unit is). */
export function isOwn(ratio: Ratio, ingredient: Pick<Ingredient, 'unit'>, unit: string): boolean {
  return unit.trim() === '' || same(ratio(unit, ingredient.unit), ONE)
}

/** What one of the line's `unit` makes of the ingredient's own unit, the
 * first rule that applies: the own unit (1); a stored conversion for the same
 * unit (its factor, which wins over a catalogue step); a catalogue step
 * straight to the own unit; a catalogue step to the unit of a stored
 * conversion (the first that is reachable) and on by its factor. Null when
 * the line doesn't convert. */
export function lineFactor(
  ratio: Ratio,
  ingredient: Pick<Ingredient, 'unit'> & { conversions: readonly Stored[] },
  unit: string,
): Fraction | null {
  if (isOwn(ratio, ingredient, unit)) return ONE
  for (const conversion of ingredient.conversions) {
    if (same(ratio(unit, conversion.unit), ONE)) return fraction(conversion.factor)
  }
  const step = ratio(unit, ingredient.unit)
  if (step) return step
  for (const conversion of ingredient.conversions) {
    const toStored = ratio(unit, conversion.unit)
    if (toStored) return times(toStored, fraction(conversion.factor))
  }
  return null
}

/** What a line's unit picker offers for an ingredient: its own unit, the
 * other units that convert (from `offered`, the catalogue's mass and volume
 * units and pieces, in the catalogue's order; not the ones with a stored
 * conversion) and the stored conversions, in the order they were added. */
export function pickerOptions(
  ratio: Ratio,
  offered: readonly CatalogueUnit[],
  ingredient: Pick<Ingredient, 'unit'> & { conversions: readonly Conversion[] },
) {
  const steps = offered.filter(
    (unit) =>
      !isOwn(ratio, ingredient, unit.symbol) &&
      !ingredient.conversions.some((conversion) => same(ratio(unit.symbol, conversion.unit), ONE)) &&
      lineFactor(ratio, ingredient, unit.symbol) !== null,
  )
  return { own: ingredient.unit, steps, conversions: [...ingredient.conversions] }
}

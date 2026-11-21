// How a portion multiplier reads on the brief and The Menu: as a cook reads
// it, not as the solver works it out ("0.657" is "0.7", "1.5" is "1½").

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }

/** A portion as a cook reads it: the solver's "0.657" to a tenth (0.7),
 * one within a hair of a quarter to that quarter ("1.5" stays 1.5). */
export function portionAmount(portion: string): number {
  const value = Number(portion)
  if (!Number.isFinite(value)) return 1
  const quarters = Math.round(value * 4) / 4
  return Math.abs(value - quarters) < 0.02 ? quarters : Math.round(value * 10) / 10
}

/** "1½", "¾", "0.7": the amount in figures, halves and quarters as fractions. */
export function portionFigure(amount: number): string {
  const whole = Math.floor(amount)
  const rest = FRACTIONS[String(amount - whole)]
  return rest ? `${whole || ''}${rest}` : String(amount)
}

// The relative luminance of #1d1d1d.
const DARK_LUMINANCE = 0.0123

/** The text colour that reads on a "#rrggbb" background: white on a dark one,
 * near-black on a light one, by WCAG relative luminance. Anything that is not
 * "#rrggbb" gets the dark text. */
export function contrastText(hex: string): '#ffffff' | '#1d1d1d' {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return '#1d1d1d'
  const [r, g, b] = match.slice(1).map((part) => {
    const channel = parseInt(part, 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Whichever of white and the dark text has the higher contrast ratio with it.
  const white = 1.05 / (luminance + 0.05)
  const dark = (luminance + 0.05) / (DARK_LUMINANCE + 0.05)
  return white > dark ? '#ffffff' : '#1d1d1d'
}

/** A number as typed in a form field, as the server expects it: "16.9".
 * A comma works as the decimal point too, as phone keyboards in many
 * languages offer one. Null if it isn't a plain decimal number. */
export function typedNumber(text: string): string | null {
  const number = text.trim().replace(',', '.')
  return /^-?(\d+\.?\d*|\.\d+)$/.test(number) ? number : null
}

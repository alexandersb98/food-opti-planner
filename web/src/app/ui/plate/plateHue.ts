/** A recipe id as a whole number: numbers as they are, text by a small
 * string hash (FNV-1a), so any id gives the same number every time. */
function idNumber(id: number | string): number {
  if (typeof id === 'number' && Number.isFinite(id)) return Math.abs(Math.trunc(id))
  let hash = 0x811c9dc5
  for (const char of String(id)) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** The golden ratio's fraction: consecutive ids land far apart. */
const GOLDEN = 0.618033988749895

/** Food colours only, as D2's hand-picked hues: berry reds through
 * tomato, saffron and herb greens (340°–125°), and a little cold blue
 * (190°–215°, skyr, fish); no purples or magentas on a plate. */
const ARCS: ReadonlyArray<readonly [start: number, span: number]> = [
  [340, 145],
  [190, 25],
]
const SPAN = ARCS.reduce((sum, [, span]) => sum + span, 0)

/** The plate's hue (0–359) for a recipe id: the same for the same id, a
 * food colour, and well spread over ids that follow each other. */
export function plateHue(id: number | string): number {
  let along = ((idNumber(id) * GOLDEN) % 1) * SPAN
  for (const [start, span] of ARCS) {
    if (along < span) return Math.round(start + along) % 360
    along -= span
  }
  return ARCS[0]![0]
}

/** Which of the four drawn dishes (plate, platter, bowl, pan) a recipe gets. */
export function plateDish(id: number | string): 0 | 1 | 2 | 3 {
  return (idNumber(id) % 4) as 0 | 1 | 2 | 3
}

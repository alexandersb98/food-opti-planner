import type { Attribute, Ingredient, Recipe, Tag } from '../../../api/types'
import { lineFactor, type Ratio } from '../../../lineUnits'
import { portionTotals, roundedText, type Amount } from '../../../totals'

// The recipe spread's reading of a stored recipe: pure, so the view mode and
// the edit mode (ticket 27) show the same lines, flags, totals and steps.

/** What a line on the spread may be flagged for: its ingredient is gone,
 * or its unit doesn't convert to the ingredient's own. */
export type LineFlag = 'missing' | 'unconvertible' | null

export interface SpreadLine {
  /** The amount as a plain number, without trailing zeros ("60", "0.5"). */
  amount: string
  /** The unit the amount is in (the ingredient's own when the line has none). */
  unit: string
  /** The ingredient's name; empty when it no longer exists. */
  name: string
  /** The ingredient's own unit, for the flag's sentence. */
  own: string
  /** The line as first written (an import keeps it), for a missing ingredient. */
  originalText: string
  flag: LineFlag
}

export interface SpreadSection {
  /** The heading to show, or null: a single unnamed section shows none. */
  heading: string | null
  lines: SpreadLine[]
}

/**
 * The recipe's sections as the spread lists them. A section's heading shows
 * only when there is more than one section or it has a name (an unnamed one
 * among several is "Section n", from `sectionN`). `ratio` is the unit
 * catalogue's; null while it isn't known, when no line is flagged for its
 * unit (the server decides).
 */
export function spreadSections(
  recipe: Recipe,
  ingredients: ReadonlyMap<number, Ingredient>,
  ratio: Ratio | null,
  sectionN: (n: number) => string,
): SpreadSection[] {
  const several = recipe.sections.length > 1
  return recipe.sections.map((section, index) => {
    const name = section.name.trim()
    return {
      heading: name || (several ? sectionN(index + 1) : null),
      lines: section.items.map((item) => {
        const ingredient = ingredients.get(item.ingredient_id)
        const unit = item.unit.trim() || ingredient?.unit || ''
        const flag: LineFlag = !ingredient
          ? 'missing'
          : ratio && lineFactor(ratio, ingredient, item.unit) === null
            ? 'unconvertible'
            : null
        return {
          amount: roundedText(item.amount, 6),
          unit,
          name: ingredient?.name ?? '',
          own: ingredient?.unit ?? '',
          originalText: item.original_text.trim(),
          flag,
        }
      }),
    }
  })
}

/**
 * One portion's totals by attribute id, as text with the attribute's
 * decimals: worked out from the lines with the pure totals module when the
 * unit catalogue is known (lines that don't convert, or whose ingredient is
 * gone, count 0); the server's own totals otherwise.
 */
export function spreadTotals(
  recipe: Recipe,
  attributes: readonly Attribute[],
  ingredients: ReadonlyMap<number, Ingredient>,
  ratio: Ratio | null,
): Map<number, string> {
  if (!ratio) {
    const sent = new Map(recipe.totals.map((total) => [total.attribute_id, total.value]))
    return new Map(attributes.map((a) => [a.id, roundedText(sent.get(a.id) ?? '0', a.decimals)]))
  }
  const amounts: Amount[] = recipe.sections.flatMap((section) =>
    section.items.flatMap(({ ingredient_id, amount, unit }) => {
      const ingredient = ingredients.get(ingredient_id)
      return ingredient ? [{ ingredient, amount, unit }] : []
    }),
  )
  return portionTotals(amounts, attributes, recipe.servings, (ingredient, unit) => lineFactor(ratio, ingredient, unit))
}

/** The recipe's tags in tag order, each with whether it comes from the
 * ingredients (a tag both added and derived counts as derived). */
export function spreadTags(recipe: Recipe, tags: readonly Tag[]): Array<{ tag: Tag; derived: boolean }> {
  const derived = new Set(recipe.derived_tag_ids)
  const extra = new Set(recipe.extra_tag_ids)
  return tags.filter((tag) => derived.has(tag.id) || extra.has(tag.id)).map((tag) => ({ tag, derived: derived.has(tag.id) }))
}

const BLANK_LINE = /\n[ \t]*\n/

/** The method's steps: the instructions split on blank lines, or on line
 * breaks when there are none; empty steps dropped. */
export function methodSteps(instructions: string): string[] {
  const text = instructions.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const parts = BLANK_LINE.test(text) ? text.split(BLANK_LINE) : text.split('\n')
  return parts.map((part) => part.trim()).filter(Boolean)
}

const HTTP_LINK = /^https?:\/\/\S+$/i

/** The source as a link the spread may offer (http or https only), with
 * its readable text (no scheme, "www." or trailing slash); null otherwise. */
export function sourceLink(source: string): { href: string; text: string } | null {
  const href = source.trim()
  if (!HTTP_LINK.test(href)) return null
  return { href, text: href.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') }
}

const ROMAN: ReadonlyArray<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

/** The plate number as a book prints it: IX for 9; arabic beyond 3999. */
export function plateNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n)
  let rest = n
  let out = ''
  for (const [value, letters] of ROMAN) {
    while (rest >= value) {
      out += letters
      rest -= value
    }
  }
  return out
}

/** The section numbers of the spread: i, ii, iii. */
export function sectionNumeral(n: number): string {
  return plateNumeral(n).toLowerCase()
}

const VULGAR: Record<string, string> = { '25': '¼', '5': '½', '75': '¾' }

/** A portion multiplier as the spread prints it: ½, 1½, 2, 0.4. */
export function portionText(multiplier: string): string {
  const text = roundedText(multiplier, 3)
  const [whole = '0', part] = text.split('.')
  const glyph = part === undefined ? undefined : VULGAR[part]
  if (!glyph) return text
  return whole === '0' ? glyph : `${whole}${glyph}`
}

import type { UnitChange, UnitChangeRefusal } from './api/types'

// The unit-change question's types and the text of a refused unit change,
// framework-neutral.

/** What the unit-change dialog shows: the thing whose unit changes, the old
 * and new unit and the server's preview. */
export interface UnitChangeRequest {
  name: string
  from: string
  to: string
  change: UnitChange
}

/** The part of a translator's `t` used here (the app's translator). */
export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** What a refusal needs from its form besides the server's facts. */
export interface RefusalContext {
  from: string
  to: string
  /** The attribute's name, for its decimals and its values. */
  attribute?: string
}

/** The sentence for a refused unit change, from the refusal's structured
 * facts, to show under the unit field. */
export function refusalText(
  t: Translate,
  refusal: Pick<UnitChangeRefusal, 'type'> & Partial<UnitChangeRefusal>,
  context: RefusalContext,
): string {
  if (refusal.type === 'unit_not_for_ingredient') return t('ingredients.unitNotForIngredient')
  if (refusal.type === 'unit_not_for_source') return t('ingredients.unitNotForSource')
  const name = refusal.name ?? ''
  const attribute = context.attribute ?? ''
  if (refusal.type === 'unit_has_dependents') {
    // "2 conversions and 3 recipe lines in other units": a count of 0 is left out.
    const parts = [
      refusal.conversions ? t('unitChange.dependents.conversions', { n: refusal.conversions }, refusal.conversions) : '',
      refusal.lines ? t('unitChange.dependents.lines', { n: refusal.lines }, refusal.lines) : '',
    ].filter(Boolean)
    return t('unitChange.refusal.unit_has_dependents', {
      name, dependents: parts.join(t('unitChange.and', {})), from: context.from, to: context.to,
    })
  }
  if (refusal.type === 'conversion_for_new_unit') {
    return t('unitChange.refusal.conversion_for_new_unit', { name, unit: refusal.unit ?? '', to: context.to })
  }
  if (refusal.type === 'unit_mismatch') {
    return t('unitChange.refusal.unit_mismatch', {
      attribute, name, source: refusal.source ?? '', column: refusal.unit ?? '', to: context.to,
    })
  }
  const field = t(`unitChange.fields.${refusal.field ?? 'value'}`)
  const kind = ['goal', 'ingredient_value', 'source_value', 'basis', 'recipe_amount', 'conversion'].includes(refusal.kind ?? '')
    ? refusal.kind
    : 'other'
  const subject = t(`unitChange.subject.${kind}`, { name, field, attribute })
  const facts = {
    subject,
    attribute,
    from: context.from,
    to: context.to,
    number: refusal.number ?? '',
    converted: refusal.converted ?? '',
    decimals: refusal.decimals_needed ?? 0,
  }
  if (refusal.type === 'conversion_needs_decimals' && refusal.decimals_needed == null) {
    return t('unitChange.refusal.conversion_needs_decimals_inexact', facts)
  }
  return t(`unitChange.refusal.${refusal.type}`, facts)
}

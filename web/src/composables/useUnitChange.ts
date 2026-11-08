import { readonly, shallowRef } from 'vue'
import type { UnitChange, UnitChangeRefusal } from '../api/types'

/** What the unit-change dialog shows: the thing whose unit changes, the old
 * and new unit and the server's preview. */
export interface UnitChangeRequest {
  name: string
  from: string
  to: string
  change: UnitChange
}

// One dialog open at a time, as one form is open: the dialog of each page
// reads this.
const open = shallowRef<{ request: UnitChangeRequest; resolve: (ok: boolean) => void } | null>(null)
const state = readonly(open)

function answer(ok: boolean) {
  const current = open.value
  open.value = null
  current?.resolve(ok)
}

/** Ask whether to go on with a unit change. Resolves true on Convert / Change
 * unit and false on Cancel. */
function ask(request: UnitChangeRequest): Promise<boolean> {
  answer(false) // never leave an earlier question hanging
  return new Promise((resolve) => {
    open.value = { request, resolve }
  })
}

export function useUnitChange() {
  return { ask, state, answer }
}

/** The part of vue-i18n's `t` used here. */
export type Translate = (key: string, named?: Record<string, unknown>) => string

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
  const name = refusal.name ?? ''
  const attribute = context.attribute ?? ''
  const field = t(`unitChange.fields.${refusal.field ?? 'value'}`)
  const kind = ['goal', 'ingredient_value', 'basis', 'recipe_amount'].includes(refusal.kind ?? '') ? refusal.kind : 'other'
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

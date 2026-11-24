import { conversionRefusal, fieldErrors } from '../../../api/errors'
import type { Attribute, Ingredient, IngredientFields, Tag } from '../../../api/types'
import { typedNumber } from '../../../numbers'
import type { Translate } from '../../../translator'
import { preferencesStore, preferredUnit } from '../../stores/preferences'

// The ingredient form's fields as typed, and what is wrong with them, as
// pure functions: the draft an ingredient (or a new one) starts as, the
// check before a save, and the server's refusal put on the fields.

/** The fields as typed; values by attribute id, empty or missing when not typed. */
export interface Draft {
  name: string
  unit: string
  basis: string
  values: Partial<Record<number, string>>
  tagIds: ReadonlySet<number>
}

export interface Errors {
  name?: string
  unit?: string
  basis?: string
  values: Partial<Record<number, string>>
  /** A failed save, for the whole form. */
  save?: string
}

export const NO_ERRORS: Errors = { values: {} }

/** The draft of `ingredient`, or of a new one: named `initialName`, in the
 * preferred mass unit (grams without one). */
export function startDraft(ingredient: Ingredient | null, initialName: string | undefined): Draft {
  if (ingredient) {
    return {
      name: ingredient.name,
      unit: ingredient.unit,
      basis: ingredient.basis,
      values: Object.fromEntries(ingredient.values.map(({ attribute_id, value }) => [attribute_id, value])),
      tagIds: new Set(ingredient.tag_ids),
    }
  }
  const unit = preferredUnit(preferencesStore.getSnapshot().preferences, 'mass') ?? 'g'
  return { name: initialName ?? '', unit, basis: '100', values: {}, tagIds: new Set() } // a mass unit: per 100
}

/** Whether any field is marked (a failed save alone is not). */
function marked(errors: Errors): boolean {
  return !!(errors.name || errors.unit || errors.basis || Object.keys(errors.values).length > 0)
}

/** The fields to send, or null; with what is wrong with each. */
export function checkDraft(
  t: Translate,
  draft: Draft,
  attributes: readonly Attribute[],
  tags: readonly Tag[],
): { fields: IngredientFields | null; errors: Errors } {
  const fields: IngredientFields = {
    name: draft.name.trim(),
    unit: draft.unit.trim(),
    basis: typedNumber(draft.basis) ?? '',
    values: [],
    tag_ids: tags.filter((tag) => draft.tagIds.has(tag.id)).map((tag) => tag.id),
  }
  const errors: Errors = { values: {} }
  if (!fields.name) errors.name = t('common.nameRequired')
  if (!fields.unit) errors.unit = t('ingredients.unitRequired')
  if (!fields.basis || !(Number(fields.basis) > 0)) errors.basis = t('ingredients.basisInvalid')
  for (const attribute of attributes) {
    const typed = draft.values[attribute.id]?.trim() ?? ''
    if (typed === '') continue // empty means 0
    const value = typedNumber(typed)
    if (value === null) errors.values[attribute.id] = t('ingredients.numberInvalid')
    else fields.values.push({ attribute_id: attribute.id, value })
  }
  return { fields: marked(errors) ? null : fields, errors }
}

/** A name in use, a unit not for an ingredient (or not mass for a linked
 * one), a refused unit change, or a number with too many digits, each on
 * its field; anything else just failed. `marked` says whether a field is. */
export function serverErrors(t: Translate, error: unknown, fields: IngredientFields): { errors: Errors; marked: boolean } {
  const byField = fieldErrors(error)
  const refusal = conversionRefusal(error)
  const errors: Errors = { values: {} }
  if (byField.name === 'name_in_use') errors.name = t('ingredients.nameInUse')
  if (byField.unit === 'unit_not_for_ingredient') errors.unit = t('ingredients.unitNotForIngredient')
  if (byField.unit === 'unit_not_for_source') errors.unit = t('ingredients.unitNotForSource')
  if (refusal) errors.unit = refusal
  if (byField.basis) errors.basis = t('ingredients.numberTooLong')
  fields.values.forEach(({ attribute_id }, i) => {
    if (byField[`values.${i}.value`]) errors.values[attribute_id] = t('ingredients.numberTooLong')
  })
  const shown = marked(errors)
  if (!shown) errors.save = t('common.saveFailed')
  return { errors, marked: shown }
}

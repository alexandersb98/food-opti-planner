import { createElement, useCallback, type ReactNode } from 'react'
import { api } from '../../../api/client'
import type { Ingredient, IngredientFields } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { askUnitChange } from '../../ui/unitChange/askUnitChange'
import { UnitChangeSheet } from '../../ui/unitChange/UnitChangeSheet'

// The unit-change question on the ingredient form (ticket 37).

/** Go on with the save, or stop with a refusal under the unit or a failed
 * preview for the whole form (neither when the owner cancelled). */
export interface IngredientUnitChangeAnswer {
  go: boolean
  unitError?: string
  saveError?: string
}

/** Asked before saving `fields` over `stored` when the unit differs. */
export type IngredientUnitChangeCheck = (stored: Ingredient, fields: IngredientFields) => Promise<IngredientUnitChangeAnswer>

/** The check and the sheet it asks in. The preview gets the basis as typed,
 * in the old unit, as the save converts it; the refusals include the
 * ingredient's own (not a unit for food, not mass for a linked one). */
export function useIngredientUnitChange(): [check: IngredientUnitChangeCheck, sheet: ReactNode] {
  const t = useT()
  const check = useCallback<IngredientUnitChangeCheck>(
    async (stored, fields) => {
      const outcome = await askUnitChange(t, { name: fields.name, from: stored.unit, to: fields.unit }, async () => {
        const { data } = await api.POST('/api/ingredients/{ingredient_id}/unit-change', {
          params: { path: { ingredient_id: stored.id } },
          body: { unit: fields.unit, basis: fields.basis },
        })
        return data
      })
      if (outcome.go) return { go: true }
      return { go: false, unitError: outcome.unitError, saveError: outcome.failed ? t('common.saveFailed') : undefined }
    },
    [t],
  )
  return [check, createElement(UnitChangeSheet)]
}

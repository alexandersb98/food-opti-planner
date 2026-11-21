import { createElement, useCallback, type ReactNode } from 'react'
import { api } from '../../../api/client'
import type { Attribute, AttributeFields } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { askUnitChange, type UnitChangeOutcome } from '../../ui/unitChange/askUnitChange'
import { UnitChangeSheet } from '../../ui/unitChange/UnitChangeSheet'

// The unit-change question on the Attributes page (ticket 37). The page calls
// the check before saving a changed unit and renders the sheet.

export type { UnitChangeOutcome }

/** Asked before saving `fields` over `attribute` when the unit differs. */
export type UnitChangeCheck = (attribute: Attribute, fields: AttributeFields) => Promise<UnitChangeOutcome>

/** The check and the sheet it asks in: the server's preview (with the typed
 * decimals, so raising them answers a "needs decimals" refusal), a refusal
 * under the unit, or the question. */
export function useAttributeUnitChange(): [check: UnitChangeCheck, sheet: ReactNode] {
  const t = useT()
  const check = useCallback<UnitChangeCheck>(
    (attribute, fields) =>
      askUnitChange(t, { name: fields.name, from: attribute.unit, to: fields.unit, attribute: fields.name }, async () => {
        const { data } = await api.POST('/api/attributes/{attribute_id}/unit-change', {
          params: { path: { attribute_id: attribute.id } },
          body: { unit: fields.unit, decimals: fields.decimals },
        })
        return data
      }),
    [t],
  )
  return [check, createElement(UnitChangeSheet)]
}

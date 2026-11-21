import type { ReactNode } from 'react'
import type { Attribute, AttributeFields } from '../../../api/types'

// The place the unit-change question (ticket 37) plugs into the Attributes
// page. The page calls the check before saving a changed unit; the hook also
// gives the sheet to render (null while there is none).

/** Whether a unit change may go on to the save. When it may not, `unitError`
 * is shown under the unit (a refusal) and `failed` as a failed save; with
 * neither (the owner cancelled) the entry just stays open. */
export type UnitChangeOutcome = { go: true } | { go: false; unitError?: string; failed?: boolean }

/** Asked before saving `fields` over `attribute` when the unit differs. */
export type UnitChangeCheck = (attribute: Attribute, fields: AttributeFields) => Promise<UnitChangeOutcome>

const goStraightOn: UnitChangeCheck = async () => ({ go: true })

/** Until ticket 37: a changed unit goes straight to the save, and anything the
 * server refuses to convert is shown under the unit by the page. */
export function useUnitChangeGoesStraightOn(): [check: UnitChangeCheck, sheet: ReactNode] {
  return [goStraightOn, null]
}

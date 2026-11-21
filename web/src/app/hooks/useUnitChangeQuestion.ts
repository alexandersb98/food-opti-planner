import { useSyncExternalStore } from 'react'
import type { UnitChangeRequest } from '../../unitChange'
import { unitChangeQuestion } from '../stores/unitChangeQuestion'

/** The open unit-change question, or null: what the sheet (ticket 37) shows.
 * Answer it with `unitChangeQuestion.answer`. */
export function useUnitChangeQuestion(): UnitChangeRequest | null {
  return useSyncExternalStore(unitChangeQuestion.subscribe, unitChangeQuestion.getSnapshot)
}

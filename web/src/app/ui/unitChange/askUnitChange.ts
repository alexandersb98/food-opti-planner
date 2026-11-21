import type { UnitChange } from '../../../api/types'
import type { Translate } from '../../../translator'
import { refusalText } from '../../../unitChange'
import { unitChangeQuestion } from '../../stores/unitChangeQuestion'

/** Whether a unit change may go on to the save. When it may not, `unitError`
 * is shown under the unit (a refusal) and `failed` as a failed save; with
 * neither (the owner cancelled) the form just stays as it is. */
export type UnitChangeOutcome = { go: true } | { go: false; unitError?: string; failed?: boolean }

/** What is changing unit, for the question and the refusal text. */
export interface UnitChangeSubject {
  /** The ingredient's or attribute's name, as typed. */
  name: string
  from: string
  to: string
  /** For an attribute: its name, for the refusals that name its decimals. */
  attribute?: string
}

/**
 * Asks the server what changing the unit does to the numbers stored in it
 * (`preview`), then the owner, through the unit-change sheet, when it
 * converts or keeps them. A refusal never reaches the sheet: it comes back
 * as the sentence for under the unit. Another spelling of the same unit goes
 * straight on. A preview that fails stops the save.
 */
export async function askUnitChange(
  t: Translate,
  subject: UnitChangeSubject,
  preview: () => Promise<UnitChange | undefined>,
): Promise<UnitChangeOutcome> {
  let change: UnitChange | undefined
  try {
    change = await preview()
  } catch {
    change = undefined
  }
  if (!change) return { go: false, failed: true }
  const { name, from, to, attribute } = subject
  if (change.refusal) return { go: false, unitError: refusalText(t, change.refusal, { from, to, attribute }) }
  if (change.kind === 'same') return { go: true }
  return (await unitChangeQuestion.ask({ name, from, to, change })) ? { go: true } : { go: false }
}

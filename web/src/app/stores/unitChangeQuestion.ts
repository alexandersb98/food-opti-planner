import type { UnitChangeRequest } from '../../unitChange'
import { createState } from './state'

// The unit-change question (C4, C5): a page asks it and awaits the owner's
// answer; the one sheet (ticket 37) reads the open question and answers it.
// One question at a time, as one form is open.
//
// The answer is a yes or a no: yes is "Convert" when the server's preview
// converts and "Change unit" when it keeps the numbers (the sheet picks the
// label from `request.change.kind`); no is Cancel.

const state = createState<UnitChangeRequest | null>(null)
let settle: ((ok: boolean) => void) | null = null

/** Answer the open question, if any: true goes on with the change (convert
 * or keep, as the preview says), false cancels. */
function answer(ok: boolean) {
  const current = settle
  settle = null
  state.set(null)
  current?.(ok)
}

/** Ask whether to go on with a unit change. Resolves true on Convert /
 * Change unit and false on Cancel. An earlier question still open is
 * settled as a no first, never left hanging. */
function ask(request: UnitChangeRequest): Promise<boolean> {
  answer(false)
  return new Promise((resolve) => {
    settle = resolve
    state.set(request)
  })
}

export const unitChangeQuestion = {
  subscribe: state.subscribe,
  /** The open question, or null. */
  getSnapshot: state.getSnapshot,
  ask,
  answer,
  /** For tests: an open question is settled as a no. */
  reset: () => answer(false),
}

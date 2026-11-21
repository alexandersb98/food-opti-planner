import { readonly, shallowRef } from 'vue'
import type { UnitChangeRequest } from '../unitChange'

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

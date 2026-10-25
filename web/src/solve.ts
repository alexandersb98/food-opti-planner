import { reactive, readonly, toRefs } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api/client'
import type { SolveFailure } from './api/types'

// The running solve (Make plan), kept outside any page so the Plan page's
// Making plan… card survives moving between pages. The server says nothing
// while it solves; the card's bar is the browser's clock against `seconds`.

/** Why the last solve made no plan: the server's reason, or 'error' when
 * the server failed or couldn't be reached. */
export type Failure = SolveFailure | 'error'

const state = reactive({
  running: false,
  startedAt: null as number | null, // Date.now() when the running solve started
  seconds: 0, // Max solving time of the running or last solve
  failure: null as Failure | null,
})
// Counts solves, so one forgotten by resetSolve can't change the state.
let solves = 0

export function useSolve() {
  const router = useRouter()

  /** Make a plan, unless one is being made. A plan opens the results if the
   * user is still on the Plan page; elsewhere the Plan page's New plan card
   * shows it. No plan: the reason is kept until dismissed. */
  async function start(seconds: number) {
    if (state.running) return
    const solve = ++solves
    Object.assign(state, { running: true, startedAt: Date.now(), seconds, failure: null })
    let failure: Failure | null = 'error'
    try {
      const { data } = await api.POST('/api/plan/solve')
      if (data) failure = data.plan ? null : (data.failure ?? 'error')
    } catch {
      // failure stays 'error'
    }
    if (solve !== solves) return
    Object.assign(state, { running: false, startedAt: null, failure })
    if (failure === null && router.currentRoute.value.name === 'plan') await router.push({ name: 'new-plan' })
  }

  function dismiss() {
    state.failure = null
  }

  return { ...toRefs(readonly(state)), start, dismiss }
}

/** Forget any solve, for tests. */
export function resetSolve() {
  solves++
  Object.assign(state, { running: false, startedAt: null, seconds: 0, failure: null })
}

import { reactive, readonly, toRefs } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api/client'
import type { ClashMember, SolveFailure } from './api/types'

// The running solve (Make plan), kept outside any page so the Plan page's
// Making plan… card survives moving between pages. The server says nothing
// while it solves; the card's bar is the browser's clock against `seconds`.

/** Why the last solve made no plan: the server's reason, 'busy' when the
 * server was already making one (from another tab, or before a reload), or
 * 'error' when the server failed or couldn't be reached. */
export type Failure = SolveFailure | 'busy' | 'error'

const state = reactive({
  running: false,
  cancelling: false, // Cancel was sent; the solve has not answered yet
  startedAt: null as number | null, // Date.now() when the running solve started
  seconds: 0, // Max solving time of the running or last solve
  failure: null as Failure | null,
  // With failure 'infeasible': the rules that can't all hold, and whether
  // the server trimmed them to a minimal set (a Cancel cuts that short).
  clash: null as ClashMember[] | null,
  clashMinimal: true,
})
// Counts solves, so one forgotten by resetSolve can't change the state.
let solves = 0
// Names the running solve. Make plan and Cancel both carry it, so a Cancel
// says which solve it means: the server may not have the solve yet (the
// card's Cancel is there from the click), and a Cancel that crosses the
// answer must not reach the next solve.
let runningId = ''

export function useSolve() {
  const router = useRouter()

  /** Make a plan, unless one is being made. A plan opens the results if the
   * user is still on the Plan page; elsewhere the Plan page's New plan card
   * shows it. No plan: the reason, and the clash with it, is kept until
   * dismissed. */
  async function start(seconds: number) {
    if (state.running) return
    const solve = ++solves
    runningId = crypto.randomUUID()
    Object.assign(state, { running: true, cancelling: false, startedAt: Date.now(), seconds, failure: null, clash: null })
    let failure: Failure | null = 'error'
    let clash: ClashMember[] | null = null
    let clashMinimal = true
    try {
      const { data, response } = await api.POST('/api/plan/solve', { body: { solve_id: runningId } })
      if (data) {
        failure = data.plan ? null : (data.failure ?? 'error')
        clash = data.clash ?? null
        clashMinimal = data.clash_minimal ?? true
      } else if (response.status === 409) failure = 'busy'
    } catch {
      // failure stays 'error'
    }
    if (solve !== solves) return
    Object.assign(state, { running: false, cancelling: false, startedAt: null, failure, clash, clashMinimal })
    if (failure === null && router.currentRoute.value.name === 'plan') await router.push({ name: 'new-plan' })
  }

  /** Stop the running solve. It then answers as usual: with the best plan
   * found so far, or the 'stopped' reason, even when the server gets the
   * Cancel first. Cancel can be tried again if the request fails. */
  async function cancel() {
    if (!state.running || state.cancelling) return
    const solve = solves
    state.cancelling = true
    let sent = false
    try {
      sent = (await api.POST('/api/plan/solve/cancel', { body: { solve_id: runningId } })).response.ok
    } catch {
      // not sent
    }
    if (!sent && solve === solves) state.cancelling = false
  }

  function dismiss() {
    Object.assign(state, { failure: null, clash: null })
  }

  return { ...toRefs(readonly(state)), start, cancel, dismiss }
}

/** Forget any solve, for tests. */
export function resetSolve() {
  solves++
  Object.assign(state, {
    running: false,
    cancelling: false,
    startedAt: null,
    seconds: 0,
    failure: null,
    clash: null,
    clashMinimal: true,
  })
}

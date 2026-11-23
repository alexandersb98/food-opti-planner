import { api } from '../../api/client'
import type { ClashMember, PlanResult, SolveFailure } from '../../api/types'
import { createState } from './state'

// The running solve (Compose the week), framework-neutral: a plain module
// with state, `subscribe` and `getSnapshot`, read in React through
// `useSyncExternalStore(subscribe, getSnapshot)`. It lives outside any page,
// so the composing view survives moving between pages. The server says
// nothing while it solves; the view's bar is the browser's clock against
// `seconds`. The store never navigates: `start` reports the outcome and the
// caller decides where to go.

/** Why the last solve made no plan: the server's reason, 'busy' when the
 * server was already making one (from another tab, or before a reload), or
 * 'error' when the server failed or couldn't be reached. */
export type Failure = SolveFailure | 'busy' | 'error'

export interface SolveState {
  running: boolean
  /** Cancel was sent; the solve has not answered yet. */
  cancelling: boolean
  /** Date.now() when the running solve started. */
  startedAt: number | null
  /** Max solving time of the running or last solve. */
  seconds: number
  /** Why the last solve made no plan, kept until dismissed or the next solve. */
  failure: Failure | null
  /** With failure 'infeasible': the rules that can't all hold. */
  clash: ClashMember[] | null
  /** Whether the server trimmed the clash to a minimal set (a Cancel cuts that short). */
  clashMinimal: boolean
}

/** How a solve ended: a plan, or the reason there is none. */
export type SolveOutcome = { plan: PlanResult; failure: null } | { plan: null; failure: Failure }

const initial: SolveState = {
  running: false,
  cancelling: false,
  startedAt: null,
  seconds: 0,
  failure: null,
  clash: null,
  clashMinimal: true,
}

const state = createState(initial)
const set = state.update

// Counts solves, so one forgotten by `reset` can't change the state.
let solves = 0
// Names the running solve. Make plan and Cancel both carry it, so a Cancel
// says which solve it means: the server may not have the solve yet (Cancel
// is there from the click), and a Cancel that crosses the answer must not
// reach the next solve.
let runningId = ''

export const subscribe = state.subscribe

/** The current state; a new object only when something changed. */
export const getSnapshot = state.getSnapshot

/** Make a plan, unless one is being made. Gives how it ended, or null when
 * a solve was already running or the store was reset meanwhile. No plan: the
 * reason, and the clash with it, is kept until dismissed. */
export async function start(seconds: number): Promise<SolveOutcome | null> {
  if (getSnapshot().running) return null
  const solve = ++solves
  runningId = crypto.randomUUID()
  set({ running: true, cancelling: false, startedAt: Date.now(), seconds, failure: null, clash: null })
  let plan: PlanResult | null = null
  let failure: Failure = 'error'
  let clash: ClashMember[] | null = null
  let clashMinimal = true
  try {
    const { data, response } = await api.POST('/api/plan/solve', { body: { solve_id: runningId } })
    if (data) {
      plan = data.plan ?? null
      failure = data.failure ?? 'error'
      clash = data.clash ?? null
      clashMinimal = data.clash_minimal ?? true
    } else if (response.status === 409) failure = 'busy'
  } catch {
    // failure stays 'error'
  }
  if (solve !== solves) return null
  set({ running: false, cancelling: false, startedAt: null, failure: plan ? null : failure, clash, clashMinimal })
  return plan ? { plan, failure: null } : { plan: null, failure }
}

/** Stop the running solve. It then answers as usual: with the best plan
 * found so far, or the 'stopped' reason, even when the server gets the
 * Cancel first. Cancel can be tried again if the request fails. */
export async function cancel(): Promise<void> {
  const { running, cancelling } = getSnapshot()
  if (!running || cancelling) return
  const solve = solves
  set({ cancelling: true })
  let sent = false
  try {
    sent = (await api.POST('/api/plan/solve/cancel', { body: { solve_id: runningId } })).response.ok
  } catch {
    // not sent
  }
  if (!sent && solve === solves) set({ cancelling: false })
}

/** Close the failure note, and the clash with it. */
export function dismiss(): void {
  set({ failure: null, clash: null })
}

/** Forget any solve (for tests, and a new session): its answer is ignored. */
export function reset(): void {
  solves++
  state.set(initial)
}

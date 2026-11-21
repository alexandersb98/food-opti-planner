import { api } from '../../api/client'
import { fieldErrors } from '../../api/errors'
import type { Plan } from '../../api/types'
import { planFields } from '../../planFields'

// The plan setup (the brief's schedule, goals, filters and time allowed),
// framework-neutral: a plain module with state, `subscribe` and
// `getSnapshot`, read in React through `useSyncExternalStore`.
//
// The server takes the setup whole (PUT /api/plan), and the brief saves every
// tap. So each change is a function of the setup; changes are saved one at a
// time, in order, each applied to the latest saved setup (the server's answer
// to the save before it) and sent whole, built by `planFields`. A change is
// shown at once (optimistic) unless asked otherwise; when its save fails it
// is taken back, and only it: the changes after it stay.

export interface PlanSetupState {
  /** The setup with the changes still being saved; null until loaded. */
  plan: Plan | null
  /** The setup is being loaded. */
  loading: boolean
  /** The last load failed (a plan loaded before stays). */
  failed: boolean
  /** Some change is still being saved. */
  saving: boolean
}

/** How a change's save ended: the saved setup, or the server's errors by
 * field (none when it failed otherwise, couldn't be reached, or nothing was
 * loaded to change). */
export type SaveResult = { plan: Plan; errors: null } | { plan: null; errors: Partial<Record<string, string>> }

/** A change of the setup: the setup it applies to, to the setup to send. */
export type PlanChange = (plan: Plan) => Plan

interface Pending {
  change: PlanChange
  optimistic: boolean
}

const initial: PlanSetupState = { plan: null, loading: false, failed: false, saving: false }

let state = initial
const listeners = new Set<() => void>()

// The setup as the server last answered it, and the changes not yet saved.
let saved: Plan | null = null
let pending: Pending[] = []
// The saves, chained so they go one at a time.
let queue: Promise<unknown> = Promise.resolve()
// Counts resets, so answers from before one are ignored.
let generation = 0
// Counts finished saves, so a load that crosses a save doesn't undo it.
let saves = 0

function set(change: Partial<PlanSetupState>) {
  state = { ...state, ...change }
  for (const listener of listeners) listener()
}

/** Show the saved setup with the pending changes that show at once. */
function show() {
  const plan = saved && pending.reduce((plan, { change, optimistic }) => (optimistic ? change(plan) : plan), saved)
  set({ plan, saving: pending.length > 0 })
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current state; a new object only when something changed. */
export function getSnapshot(): PlanSetupState {
  return state
}

/** Load the setup from the server (again). An answer that arrives while a
 * change is being saved, or after one was, is ignored: the saves' answers
 * are newer. */
export async function load(): Promise<void> {
  const loading = generation
  const savesBefore = saves
  set({ loading: true, failed: false })
  let plan: Plan | undefined
  try {
    plan = (await api.GET('/api/plan')).data
  } catch {
    // plan stays undefined
  }
  if (loading !== generation) return
  if (plan && pending.length === 0 && saves === savesBefore) {
    saved = plan
    set({ loading: false })
    show()
  } else set({ loading: false, failed: !plan })
}

/** Change the setup and save it. The change runs on the latest saved setup
 * when its turn comes, after the saves before it. With `optimistic` (the
 * default) it shows at once, and is taken back if its save fails; without,
 * it shows once saved (for a sheet that stays open with the server's
 * errors). Gives how the save ended. */
export function change(update: PlanChange, { optimistic = true } = {}): Promise<SaveResult> {
  if (!saved) return Promise.resolve({ plan: null, errors: {} })
  const changing = generation
  const entry: Pending = { change: update, optimistic }
  pending = [...pending, entry]
  show()

  async function save(): Promise<SaveResult> {
    if (changing !== generation || !saved) return { plan: null, errors: {} }
    let result: SaveResult = { plan: null, errors: {} }
    try {
      const { data, error } = await api.PUT('/api/plan', { body: planFields(update(saved)) })
      result = data ? { plan: data, errors: null } : { plan: null, errors: fieldErrors(error) }
    } catch {
      // not saved
    }
    if (changing !== generation) return result
    saves++
    pending = pending.filter((other) => other !== entry)
    if (result.plan) saved = result.plan
    show()
    return result
  }

  const saving = queue.then(save)
  queue = saving.catch(() => {})
  return saving
}

/** Resolves once every change asked for so far is saved (or failed). */
export function settled(): Promise<void> {
  return queue.then(() => {})
}

/** Forget the setup and any unsaved change (for tests, and a new session):
 * answers to earlier loads and saves are ignored. */
export function reset(): void {
  generation++
  saved = null
  pending = []
  queue = Promise.resolve()
  set(initial)
}

import { createState, type Readable } from './state'

// A value loaded once from the server and shared by every reader: the base
// of the stores that hold what the server sent (the unit catalogue, the
// preferences). The state is the store's own fields plus `loading` and
// `failed`; a load fills the fields its answer gives.

export interface LoadState {
  loading: boolean
  failed: boolean
}

export interface ServerValue<S extends LoadState> extends Readable<S> {
  /** Fetch the value once; later calls return at once, calls during a load
   * share it. A failed load is tried again by the next call. Never rejects. */
  load: () => Promise<void>
  /** Fetch the value again even if it is loaded, keeping what is shown
   * meanwhile; a fetch already under way is shared. True if the answer was
   * taken: false if it failed, or an invalidate or reset came first. */
  refresh: () => Promise<boolean>
  /** Whether the value is loaded and not invalidated since. */
  isLoaded: () => boolean
  /** Replace some fields with a newer answer from the server (after a save);
   * the value then counts as loaded. */
  set: (fields: Partial<S>) => void
  /** The value may be out of date: the next load fetches it again, and a
   * load in flight no longer counts. What is shown stays until then. */
  invalidate: () => void
  /** Forget the value, for tests: a load in flight no longer counts. */
  reset: () => void
  /** A check that stays true until the next reset, for an answer (a save's)
   * that must not land after one. */
  untilReset: () => () => boolean
}

/** A server value that starts as `empty`; `fetch` asks the server and gives
 * the fields its answer fills, or undefined when the server refused. A
 * thrown fetch is a failed load too. */
export function createServerValue<S extends LoadState>(
  empty: S,
  fetch: () => Promise<Partial<S> | undefined>,
): ServerValue<S> {
  const state = createState<S>(empty)
  let loaded = false
  let pending: Promise<boolean> | null = null
  // Counts resets and invalidations, so a load in flight at one can't fill
  // the state.
  let generation = 0
  // Counts resets only, for `untilReset`.
  let resets = 0

  /** One fetch; true if its answer filled the state. */
  async function fetchValue(): Promise<boolean> {
    const mine = generation
    state.update({ loading: true, failed: false } as Partial<S>)
    try {
      const fields = await fetch()
      if (mine !== generation) return false
      if (fields) {
        loaded = true
        state.update({ ...fields, loading: false })
        return true
      }
      state.update({ failed: true, loading: false } as Partial<S>)
    } catch {
      if (mine === generation) state.update({ failed: true, loading: false } as Partial<S>)
    }
    return false
  }

  /** The fetch under way, or a new one. */
  function shared(): Promise<boolean> {
    if (!pending) {
      const mine = fetchValue().finally(() => {
        if (pending === mine) pending = null
      })
      pending = mine
    }
    return pending
  }

  function load(): Promise<void> {
    if (loaded) return Promise.resolve()
    return shared().then(() => {})
  }

  /** Let the next load fetch afresh, ignoring any load in flight. */
  function forget() {
    generation++
    loaded = false
    pending = null
  }

  return {
    subscribe: state.subscribe,
    getSnapshot: state.getSnapshot,
    load,
    refresh: shared,
    isLoaded: () => loaded,
    set(fields) {
      loaded = true
      state.update(fields)
    },
    invalidate() {
      forget()
      if (state.getSnapshot().loading) state.update({ loading: false } as Partial<S>)
    },
    reset() {
      resets++
      forget()
      state.set(empty)
    },
    untilReset() {
      const mine = resets
      return () => mine === resets
    },
  }
}

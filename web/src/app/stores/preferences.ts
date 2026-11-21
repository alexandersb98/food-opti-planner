import { api } from '../../api/client'
import type { Preferences } from '../../api/types'
import { createState } from './state'
import type { Category } from './units'

// The preferences the server holds (GET /api/preferences), loaded once and
// shared, so a changed preferred unit reaches every unit field without a
// refetch. Saves go one at a time. A port of the Vue `preferences` module.

export interface PreferencesState {
  preferences: Preferences | null // null until loaded
  loading: boolean
  failed: boolean
}

const EMPTY: PreferencesState = { preferences: null, loading: false, failed: false }

const state = createState<PreferencesState>(EMPTY)
let pending: Promise<void> | null = null
// Saves run one after the other, so answers can't arrive out of order.
let saves: Promise<unknown> = Promise.resolve()
// Counts resets, so a request in flight at one can't fill the state.
let generation = 0

async function fetchPreferences() {
  const mine = generation
  state.update({ loading: true, failed: false })
  try {
    const { data } = await api.GET('/api/preferences')
    if (mine !== generation) return
    if (data) state.update({ preferences: data, loading: false })
    else state.update({ failed: true, loading: false })
  } catch {
    if (mine === generation) state.update({ failed: true, loading: false })
  }
}

/** Fetch the preferences once; later calls return at once, calls during a
 * load share it. A failed load is tried again by the next call. Never
 * rejects. */
function load(): Promise<void> {
  if (state.getSnapshot().preferences) return Promise.resolve()
  pending ??= fetchPreferences().finally(() => (pending = null))
  return pending
}

/** Save one preference, after any save still under way. The state becomes
 * the server's answer (which spells a unit as the catalogue does). False,
 * with the state as it was, if the server refuses or can't be reached. */
function set(key: keyof Preferences, value: string): Promise<boolean> {
  const mine = generation
  const save = saves.then(async () => {
    try {
      const { data } = await api.PUT('/api/preferences', { body: { [key]: value } })
      if (!data) return false
      if (mine === generation) state.update({ preferences: data })
      return true
    } catch {
      return false
    }
  })
  saves = save
  return save
}

/** Forget the preferences, for tests: requests in flight no longer count. */
function reset() {
  generation++
  pending = null
  saves = Promise.resolve()
  state.set(EMPTY)
}

export const preferencesStore = {
  subscribe: state.subscribe,
  getSnapshot: state.getSnapshot,
  load,
  set,
  reset,
}

const PREFERENCE_KEY = { mass: 'unit.mass', volume: 'unit.volume', energy: 'unit.energy' } as const satisfies Record<
  Category,
  keyof Preferences
>

/** The owner's preferred unit of a category (its symbol), or undefined while
 * the preferences aren't loaded. */
export function preferredUnit(preferences: Preferences | null, category: Category): string | undefined {
  return preferences?.[PREFERENCE_KEY[category]]
}

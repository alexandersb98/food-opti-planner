import { api } from '../../api/client'
import type { Preferences } from '../../api/types'
import { createServerValue } from './serverValue'
import type { Category } from './units'

// The preferences the server holds (GET /api/preferences), loaded once and
// shared, so a changed preferred unit reaches every unit field without a
// refetch. Saves go one at a time.

export interface PreferencesState {
  preferences: Preferences | null // null until loaded
  loading: boolean
  failed: boolean
}

const EMPTY: PreferencesState = { preferences: null, loading: false, failed: false }

const server = createServerValue(EMPTY, async () => {
  const { data } = await api.GET('/api/preferences')
  return data && { preferences: data }
})
// Saves run one after the other, so answers can't arrive out of order.
let saves: Promise<unknown> = Promise.resolve()

/** Save one preference, after any save still under way. The state becomes
 * the server's answer (which spells a unit as the catalogue does). False,
 * with the state as it was, if the server refuses or can't be reached. */
function set(key: keyof Preferences, value: string): Promise<boolean> {
  const current = server.untilReset()
  const save = saves.then(async () => {
    try {
      const { data } = await api.PUT('/api/preferences', { body: { [key]: value } })
      if (!data) return false
      if (current()) server.set({ preferences: data })
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
  saves = Promise.resolve()
  server.reset()
}

export const preferencesStore = {
  subscribe: server.subscribe,
  getSnapshot: server.getSnapshot,
  load: server.load,
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

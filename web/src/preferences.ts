import { reactive, readonly, toRefs } from 'vue'
import { api } from './api/client'
import type { Preferences } from './api/types'

// The preferences the server holds (GET /api/preferences), shared by every
// page, so a changed preferred unit reaches the unit fields without a refetch.

const state = reactive({
  preferences: null as Preferences | null, // null until loaded
  loading: false,
  failed: false,
})
let pending: Promise<void> | null = null
// Counts resets, so a request in flight at one can't fill the state.
let generation = 0

export function usePreferences() {
  async function fetchPreferences() {
    const mine = generation
    state.loading = true
    state.failed = false
    try {
      const { data } = await api.GET('/api/preferences')
      if (mine !== generation) return
      if (data) state.preferences = data
      else state.failed = true
    } catch {
      if (mine === generation) state.failed = true
    }
    if (mine === generation) state.loading = false
  }

  /** Fetch the preferences once; later calls return at once. A failed load
   * can be tried again. */
  function load(): Promise<void> {
    if (state.preferences) return Promise.resolve()
    pending ??= fetchPreferences().finally(() => (pending = null))
    return pending
  }

  /** Save one preference. The state becomes the server's answer (which has
   * the unit spelled as the catalogue does). False, with the state as it
   * was, if the server refuses or can't be reached. */
  async function set(key: keyof Preferences, unit: string): Promise<boolean> {
    const mine = generation
    try {
      const { data } = await api.PUT('/api/preferences', { body: { [key]: unit } })
      if (!data) return false
      if (mine === generation) state.preferences = data
      return true
    } catch {
      return false
    }
  }

  return { ...toRefs(readonly(state)), load, set }
}

/** Forget the preferences, for tests. */
export function resetPreferences() {
  generation++
  pending = null
  Object.assign(state, { preferences: null, loading: false, failed: false })
}

import { useEffect, useSyncExternalStore } from 'react'
import { preferencesStore, type PreferencesState } from '../stores/preferences'

/** The shared preferences, loading them once on first use, and `set` to
 * save one (saves go one at a time; see the store). */
export function usePreferences(): PreferencesState & { set: typeof preferencesStore.set } {
  const state = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getSnapshot)
  useEffect(() => {
    void preferencesStore.load()
  }, [])
  return { ...state, set: preferencesStore.set }
}

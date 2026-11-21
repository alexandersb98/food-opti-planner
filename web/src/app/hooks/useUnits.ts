import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { catalogue, unitsStore, type Catalogue, type UnitsState } from '../stores/units'

/** The shared unit catalogue and its lookups, loading it once on first use
 * (a failed load is tried again by the next reader to mount). The lookups
 * change only when the catalogue does. */
export function useUnits(): UnitsState & Catalogue {
  const state = useSyncExternalStore(unitsStore.subscribe, unitsStore.getSnapshot)
  useEffect(() => {
    void unitsStore.load()
  }, [])
  const lookups = useMemo(() => catalogue(state.units), [state.units])
  return { ...state, ...lookups }
}

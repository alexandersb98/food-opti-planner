import { useSyncExternalStore } from 'react'
import { editionStore, type Edition } from '../stores/edition'

/** The current edition, re-rendering when it changes. Change it with
 * `editionStore.set`. */
export function useEdition(): Edition {
  return useSyncExternalStore(editionStore.subscribe, editionStore.getSnapshot)
}

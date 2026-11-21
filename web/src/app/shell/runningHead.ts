import { createContext, use, useEffect, useSyncExternalStore } from 'react'

// A page's own running head (a recipe spread shows the recipe's name), in
// place of its registry page's. One per shell, so it goes with the shell
// and needs no resetting between tests; only the masthead re-renders when
// it changes.

export interface RunningHeadOverride {
  subscribe: (listener: () => void) => () => void
  get: () => string | null
  set: (text: string | null) => void
}

export function createRunningHeadOverride(): RunningHeadOverride {
  let text: string | null = null
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => text,
    set(next) {
      if (next === text) return
      text = next
      for (const listener of listeners) listener()
    },
  }
}

export const RunningHeadContext = createContext<RunningHeadOverride | null>(null)

/** Shows `text` in the running head while the calling page is open (none,
 * or no text yet, keeps the registry page's). */
export function useRunningHead(text: string | null | undefined) {
  const override = use(RunningHeadContext)
  useEffect(() => {
    if (!override || !text) return
    override.set(text)
    return () => override.set(null)
  }, [override, text])
}

/** The override in force, for the masthead. */
export function useRunningHeadOverride(): string | null {
  const override = use(RunningHeadContext)
  return useSyncExternalStore(override?.subscribe ?? noSubscribe, override?.get ?? noText)
}

const noSubscribe = () => () => {}
const noText = () => null

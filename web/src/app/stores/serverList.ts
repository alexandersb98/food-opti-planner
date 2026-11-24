import type { Loaded } from '../../load'
import { createServerValue, type ServerValue } from './serverValue'
import type { Readable } from './state'

// A list the server sends whole (the attributes, the tags, the ingredients),
// kept for the whole visit and shared by every page that shows it, so going
// from page to page does not download it again.
//
// Freshness: stale while revalidate. A page that opens while the list is
// held gets it at once, and the list is asked for again in the background;
// if the server's copy differs, the page's data is replaced when it comes
// (`useLoad` applies it). Another tab or device may have changed the list,
// so a held copy is never trusted on its own. A change made here (any call
// that writes, see `sharedLists`) invalidates the lists it can touch: the
// next page to open then waits for the server's copy, as a held one would
// show wrong names or counts, and an answer in flight no longer counts.

export interface ListState<T> {
  items: readonly T[] | null // null until loaded
  loading: boolean
  failed: boolean
}

export interface ServerList<T> extends Readable<ListState<T>> {
  /** The list for a page's load (`useLoad`, `loadAll`): at once, with a
   * background refresh, if it is held and not invalidated; else after the
   * server's answer. No data if the server refused or can't be reached. */
  loadCall: () => Promise<Loaded<T[]>>
  /** The list may be out of date: the next load waits for the server, and
   * an answer in flight no longer counts. */
  invalidate: () => void
  /** Forget the list, for tests. */
  reset: () => void
}

/** A shared list; `fetch` asks the server and gives the list, or undefined
 * when the server refused. */
export function createServerList<T>(fetch: () => Promise<T[] | undefined>): ServerList<T> {
  const empty: ListState<T> = { items: null, loading: false, failed: false }
  const server: ServerValue<ListState<T>> = createServerValue(empty, async () => {
    const before = server.getSnapshot().items
    const items = await fetch()
    if (!items) return undefined
    // The same list again keeps the copy held, so nothing shown changes.
    return { items: before && JSON.stringify(before) === JSON.stringify(items) ? before : items }
  })
  const items = () => server.getSnapshot().items

  async function loadCall(): Promise<Loaded<T[]>> {
    const held = items()
    if (server.isLoaded() && held) {
      const refreshed = server.refresh().then((taken) => {
        const newer = items()
        return taken && newer && newer !== held ? () => [...newer] : undefined
      })
      return { data: [...held], refreshed }
    }
    // A load dropped by an invalidation (a change made while it was under
    // way) is asked again; a refused one is not.
    for (let tries = 0; tries < 3; tries++) {
      await server.load()
      const loaded = items()
      if (server.isLoaded() && loaded) return { data: [...loaded] }
      if (server.getSnapshot().failed) break
    }
    return {}
  }

  return {
    subscribe: server.subscribe,
    getSnapshot: server.getSnapshot,
    loadCall,
    invalidate: server.invalidate,
    reset: server.reset,
  }
}

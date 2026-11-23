import { useCallback, useEffect, useRef, useState } from 'react'
import type { Loaded, Refresh } from '../../load'

/** A page's data call: an openapi-fetch answer, a shared list's `loadCall`,
 * or `loadAll({...})` for several calls at once. No `data` (or a throw)
 * means it failed. The signal is aborted when the answer is no longer
 * wanted; passing it on is optional. */
export type LoadCall<T> = (signal: AbortSignal) => Promise<Loaded<T>>

export interface Load<T> {
  /** The loaded data; undefined until the first answer for the current key. */
  data: T | undefined
  /** A call for the current key is under way (first load, new key or reload). */
  loading: boolean
  /** The latest call failed (no data, an error answer, or no connection). */
  failed: boolean
  /** Asks again, keeping the data shown meanwhile ("Try again"). */
  reload: () => void
  /** Changes the loaded data in place, e.g. after a save answered with the
   * stored value. Ignored until there is data. */
  setData: (update: T | ((data: T) => T)) => void
}

export interface LoadOptions {
  /** Keys of one group keep the data shown while a new key loads, and when
   * it fails: a new search text keeps the foods of the old one until it
   * answers. Without a group, or in another one, a new key starts empty. */
  group?: string | number
}

const NOT_YET = Symbol('not loaded')

interface State<T> {
  /** The key the data (or failure) belongs to. */
  key: unknown
  /** That key's group, if any. */
  group: unknown
  data: T | undefined
  failed: boolean
  /** A reload of the same key is under way. */
  reloading: boolean
}

/**
 * Loads a page's data when it opens, and again whenever `key` changes (e.g.
 * the recipe id of `/recipes/:id`). Several calls run in parallel through
 * `loadAll`:
 *
 * ```ts
 * const page = useLoad((signal) => loadAll({ tags: tagsList.loadCall(), recipes: api.GET('/api/recipes', { signal }) }))
 * if (!page.data) return <LoadState of={page} message={t('tags.loadFailed')} />
 * ```
 *
 * Only the answer to the latest call counts: an answer that arrives after
 * the page left, after the key changed or after a newer reload is ignored
 * (so React's strict-mode double effects never show stale data). An answer
 * from a shared list's cache shows at once, and the list's newer copy from
 * the server replaces it when it comes (see `stores/serverList`). The call
 * is read when it runs, so an inline arrow is fine.
 */
export function useLoad<T>(call: LoadCall<T>, key: string | number = '', { group }: LoadOptions = {}): Load<T> {
  const [state, setState] = useState<State<T>>({ key: NOT_YET, group: NOT_YET, data: undefined, failed: false, reloading: false })
  const latestCall = useRef(call)
  const latestGroup = useRef(group)
  // The latest call, settled or not; a newer one (or leaving) aborts it and
  // ignores its answer and its cache refresh.
  const running = useRef<AbortController | null>(null)

  useEffect(() => {
    latestCall.current = call
    latestGroup.current = group
  })

  const start = useCallback((forKey: string | number) => {
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    const forGroup = latestGroup.current
    const settle = (data: T | undefined) => {
      if (controller.signal.aborted) return
      setState((previous) => ({
        key: forKey,
        group: forGroup,
        data: data ?? (previous.key === forKey || kept(previous.group, forGroup) ? previous.data : undefined),
        failed: data === undefined,
        reloading: false,
      }))
    }
    // A cache that answered at once asked the server again: its newer data
    // replaces what is shown, unless a newer call or leaving came first.
    const refresh = (update: Refresh<T> | undefined) => {
      if (!update || controller.signal.aborted) return
      setState((previous) =>
        previous.key === forKey && previous.data !== undefined ? { ...previous, data: update(previous.data) } : previous,
      )
    }
    Promise.resolve()
      .then(() => latestCall.current(controller.signal))
      .then(
        (answer) => {
          settle(answer.data)
          if (answer.data !== undefined) answer.refreshed?.then(refresh, () => {})
        },
        () => settle(undefined),
      )
    return controller
  }, [])

  useEffect(() => {
    const controller = start(key)
    return () => controller.abort()
  }, [key, start])

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, failed: false, reloading: true }))
    start(key)
  }, [key, start])

  const setData = useCallback((update: T | ((data: T) => T)) => {
    setState((previous) => {
      if (previous.data === undefined) return previous
      const data = typeof update === 'function' ? (update as (data: T) => T)(previous.data) : update
      return { ...previous, data }
    })
  }, [])

  // Data and failures belong to the key they were loaded for; a new key
  // starts out loading, with nothing shown from the old one unless both
  // are of one group.
  const current = state.key === key
  return {
    data: current || kept(state.group, group) ? state.data : undefined,
    loading: !current || state.reloading,
    failed: current && state.failed,
    reload,
    setData,
  }
}

/** Whether data loaded in one group stays shown for a key of another. */
function kept(shown: unknown, wanted: string | number | undefined) {
  return wanted !== undefined && shown === wanted
}

// Loading several calls at once, framework-neutral: the React load hook
// (`app/hooks/useLoad`) takes its answer.

/** What a call answers: data, or none when it failed. A call that answered
 * from a cache may add `refreshed`, which settles once the cache has asked
 * the server again: with a change to make to the data shown, or undefined
 * when there is nothing newer. */
export interface Loaded<T> {
  data?: T
  refreshed?: Promise<Refresh<T> | undefined>
}

/** Turns the data shown into the newer data. */
export type Refresh<T> = (data: T) => T

// `refreshed` is loose here, as a refresh of a list is not one of `unknown`.
type Answer = Promise<{ data?: unknown; refreshed?: Promise<unknown> }>
type AllData<T extends Record<string, Answer>> = { [K in keyof T]: Exclude<Awaited<T[K]>['data'], undefined> }

/** Several calls at once, for a load hook: their data by name if every one
 * answered with data, and no data if any failed. Calls answered from a
 * cache refresh their own part of the data only, so a change the page made
 * to another part stays.
 * `useLoad(() => loadAll({ tags: tagsList.loadCall(), ... }), initial)` */
export async function loadAll<T extends Record<string, Answer>>(calls: T): Promise<Loaded<AllData<T>>> {
  const names = Object.keys(calls)
  const answers = await Promise.all(Object.values(calls))
  if (answers.some((answer) => answer.data === undefined)) return {}
  const data = Object.fromEntries(names.map((name, i) => [name, answers[i]!.data])) as AllData<T>
  const refreshes = names.flatMap((name, i) => {
    const refreshed = answers[i]!.refreshed as Loaded<unknown>['refreshed']
    return refreshed ? [refreshed.then((refresh) => refresh && ([name, refresh] as const))] : []
  })
  if (refreshes.length === 0) return { data }
  const refreshed = Promise.all(refreshes).then((settled) => {
    const changes = settled.filter((change) => !!change)
    if (changes.length === 0) return undefined
    return (shown: AllData<T>) => {
      const next: Record<string, unknown> = { ...shown }
      for (const [name, refresh] of changes) next[name] = refresh(next[name])
      return next as AllData<T>
    }
  })
  return { data, refreshed }
}

import { useRef } from 'react'
import { api } from '../../../api/client'
import type { FoodSummary } from '../../../api/types'
import { useLoad } from '../../hooks/useLoad'

/** The foods matching the search, a page at a time, loaded by `useLoad`:
 * a newer search (or leaving) aborts and ignores the one before, Show more
 * included. The foods shown stay until a new search answers, except that
 * another source starts with none. */
export function useFoodSearch(sourceKey: string, query: string) {
  // the foods Show more appends the next page to; none for a new search
  const shownBefore = useRef<FoodSummary[]>([])
  const load = useLoad(
    async (signal) => {
      const before = shownBefore.current
      shownBefore.current = []
      const { data } = await api.GET('/api/data-sources/{key}/foods', {
        params: { path: { key: sourceKey }, query: { search: query, offset: before.length } },
        signal,
      })
      return { data: data && { foods: [...before, ...data.foods], total: data.total } }
    },
    JSON.stringify([sourceKey, query]),
    { group: sourceKey },
  )
  const foods = load.data?.foods ?? []
  return {
    foods,
    total: load.data?.total ?? 0,
    searching: load.loading,
    failed: load.failed,
    // the next page, kept apart from a Try again, which starts over
    more: () => {
      shownBefore.current = foods
      load.reload()
    },
    retry: load.reload,
  }
}

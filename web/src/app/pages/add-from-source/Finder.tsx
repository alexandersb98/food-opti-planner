import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { DataSourceSummary, FoodSummary } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { LoadState } from '../../ui/loadState/LoadState'
import { FoodToAdd } from './FoodToAdd'
import { useFoodSearch } from './useFoodSearch'

/** ms after the last key before a search is sent */
const SEARCH_DELAY = 300

/** The source, the search and its results, and the chosen food in their
 * place. The results stay on the page (hidden) while a food is shown, so Back to
 * results finds them, the search and the scroll as they were. */
export function Finder({ source, picker }: { source: DataSourceSummary; picker: ReactNode }) {
  const t = useT()
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const search = useFoodSearch(source.key, query)
  // the chosen food, of the source it was chosen from
  const [choice, setChoice] = useState<{ key: string; food: FoodSummary } | null>(null)
  const chosen = choice?.key === source.key ? choice.food : null
  const listRef = useRef<HTMLUListElement>(null)
  // the row to give focus back to after Back to results
  const backTo = useRef<number | null>(null)
  const searchId = useId()

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (chosen !== null || backTo.current === null) return
    listRef.current?.querySelector<HTMLElement>(`[data-food="${backTo.current}"]`)?.focus()
    backTo.current = null
  }, [chosen])

  const type = (text: string) => {
    setTyped(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setQuery(text), SEARCH_DELAY)
  }

  const back = () => {
    backTo.current = chosen?.id ?? null
    setChoice(null)
  }

  const { foods, total } = search
  const hasMore = foods.length < total && !search.failed

  return (
    <>
      <div className="afs-results" hidden={chosen !== null}>
        {picker}
        <div className="afs-search">
          <SearchIcon />
          <label className="visually-hidden" htmlFor={searchId}>
            {t('addFromSource.search')}
          </label>
          <input
            id={searchId}
            type="search"
            className="afs-search-input"
            placeholder={t('addFromSource.search')}
            name="food-search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={typed}
            onChange={(event) => type(event.target.value)}
          />
        </div>
        <p className="afs-count" role="status">
          {search.failed || (search.searching && foods.length === 0)
            ? ''
            : foods.length < total
              ? t('addFromSource.showing', { shown: foods.length, total })
              : t('addFromSource.foods', { n: total })}
        </p>
        {search.failed ? (
          <LoadState of={{ failed: true, loading: false, reload: search.retry }} message={t('addFromSource.loadFailed')} />
        ) : foods.length === 0 ? (
          search.searching ? null : <p className="afs-quiet">{t('addFromSource.noResults')}</p>
        ) : (
          <ul ref={listRef} className="afs-foods" aria-busy={search.searching}>
            {foods.map((food) => (
              <li key={food.id}>
                <button type="button" className="afs-food" data-food={food.id} onClick={() => setChoice({ key: source.key, food })}>
                  <span className="afs-food-name">{food.name}</span>
                  {food.groups.length > 0 ? <span className="afs-food-groups">{food.groups.join(', ')}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore ? (
          <Button
            variant="ghost"
            block
            className="afs-more"
            aria-disabled={search.searching}
            onClick={() => {
              if (!search.searching) search.more()
            }}
          >
            {t('addFromSource.showMore')}
          </Button>
        ) : null}
      </div>
      {chosen ? <FoodToAdd key={chosen.id} source={source} food={chosen} onBack={back} /> : null}
    </>
  )
}

/** D2's magnifier. */
function SearchIcon() {
  return (
    <svg className="afs-search-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

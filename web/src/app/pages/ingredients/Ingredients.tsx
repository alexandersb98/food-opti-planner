import { useDeferredValue, useId, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Attribute, Ingredient } from '../../../api/types'
import { valueText } from '../../../format'
import { byId, filterByName, sortByName } from '../../../lists'
import { loadAll } from '../../../load'
import type { Translate } from '../../../translator'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { attributesList, ingredientsList } from '../../stores/sharedLists'
import { Button, buttonClass } from '../../ui/button/Button'
import { Chip } from '../../ui/chips/Chips'
import { LoadState } from '../../ui/loadState/LoadState'
import { AddMenu } from './AddMenu'
import './ingredients.css'

const hasUpdates = (ingredient: Ingredient) => ingredient.updated_values.length > 0

/** The Ingredients page: the larder A to Z, each ingredient with its basis
 * and values, searchable, with the ones whose data source has new values
 * marked and, when there are any, a filter for just those. */
export function Ingredients() {
  const t = useT()
  // the attributes give each value its name and unit
  const page = useLoad(() =>
    loadAll({ ingredients: ingredientsList.loadCall(), attributes: attributesList.loadCall() }),
  )
  const count = page.data?.ingredients.length

  return (
    <article className="ingr">
      <div className="cover ingr-cover">
        <p className="kicker ingr-kicker">{count === undefined ? ' ' : t('ingredients.larder', { n: count })}</p>
        <h1 className="cover-title display ingr-title">
          <em>{t('shell.pages.ingredients.title')}</em>
        </h1>
        <p className="standfirst ingr-standfirst">{t('ingredients.intro')}</p>
        <AddMenu />
      </div>
      {page.data ? (
        <Larder ingredients={page.data.ingredients} attributes={page.data.attributes} />
      ) : (
        <LoadState of={page} message={t('ingredients.loadFailed')} />
      )}
    </article>
  )
}

/** The search, the updated-values filter and the list. Both are kept in
 * the address (`?q=oat&updated=1`, replaced, not pushed), so coming back
 * from an ingredient finds the list as it was left. */
function Larder({ ingredients, attributes }: { ingredients: Ingredient[]; attributes: Attribute[] }) {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const onlyUpdated = params.get('updated') === '1'
  const setParam = (name: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: true },
    )
  const setSearch = (text: string) => setParam('q', text)
  const searchBox = useRef<HTMLInputElement>(null)
  const searchId = useId()
  // Sorted once when the larder changes; each keystroke only filters, and
  // the list follows the box a moment behind so typing stays quick.
  const sorted = useMemo(() => sortByName(ingredients), [ingredients])
  const named = useMemo(() => byId(attributes), [attributes])
  const deferredSearch = useDeferredValue(search)
  const found = useMemo(() => filterByName(sorted, deferredSearch), [sorted, deferredSearch])

  if (ingredients.length === 0) {
    return (
      <div className="empty-state ingr-empty">
        <p>{t('ingredients.empty')}</p>
        <p className="empty-state-hint">{t('ingredients.emptyHint')}</p>
        <Link className={buttonClass()} to="/ingredients/new">
          {t('ingredients.new')}
        </Link>
      </div>
    )
  }

  const updatedCount = ingredients.filter(hasUpdates).length
  // the filter is ignored while its toggle is hidden (nothing has updates)
  const filtering = onlyUpdated && updatedCount > 0
  const shown = filtering ? found.filter(hasUpdates) : found
  const narrowed = deferredSearch.trim() !== '' || filtering

  const clear = () => {
    setSearch('')
    searchBox.current?.focus()
  }

  return (
    <>
      <div className="ingr-tools">
        <div className="ingr-search">
          <SearchIcon />
          <label className="visually-hidden" htmlFor={searchId}>
            {t('ingredients.searchLabel')}
          </label>
          <input
            ref={searchBox}
            id={searchId}
            type="search"
            className="ingr-search-input"
            placeholder={t('ingredients.searchLabel')}
            name="q"
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {updatedCount > 0 ? (
          <Chip className="ingr-only-updated" pressed={onlyUpdated} onClick={() => setParam('updated', onlyUpdated ? '' : '1')}>
            {t('ingredients.onlyUpdated', { n: updatedCount })}
          </Chip>
        ) : null}
      </div>
      <p className="visually-hidden" role="status">
        {narrowed ? t('count.ingredients', { n: shown.length }) : ''}
      </p>
      {shown.length > 0 ? (
        <ul className="ingr-list">
          {shown.map((ingredient) => (
            <li key={ingredient.id}>
              <IngredientEntry ingredient={ingredient} values={valuesLine(t, ingredient, named)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state ingr-empty">
          <p>{filtering && found.length > 0 ? t('ingredients.noUpdated') : t('ingredients.noMatch')}</p>
          {search ? (
            <Button variant="text" onClick={clear}>
              {t('ingredients.clearSearch')}
            </Button>
          ) : null}
        </div>
      )}
    </>
  )
}

/** One entry: the name, its basis and values, the updated-values mark, and
 * how many recipes use it. */
function IngredientEntry({ ingredient, values }: { ingredient: Ingredient; values: string }) {
  const t = useT()
  return (
    <Link className="ingr-entry" to={`/ingredients/${ingredient.id}`}>
      <span className="ingr-entry-main">
        <span className="ingr-name">{ingredient.name}</span>
        <span className="ingr-values">{values}</span>
        {hasUpdates(ingredient) ? <span className="ingr-updated">{t('ingredients.updatedMarker')}</span> : null}
      </span>
      <span className="ingr-used">{t('ingredients.usedIn', { recipes: t('count.recipes', { n: ingredient.recipe_count }) })}</span>
    </Link>
  )
}

/** "per 100 g · Energy 389 kcal · Protein 16.9 g": the basis and the values
 * typed in, in the ingredient's order. */
function valuesLine(t: Translate, ingredient: Ingredient, attributes: Map<number, Attribute>) {
  const typed = ingredient.values.flatMap(({ attribute_id, value }) => {
    const attribute = attributes.get(attribute_id)
    return attribute ? [valueText(attribute, value)] : []
  })
  return [t('ingredients.perBasis', { basis: ingredient.basis, unit: ingredient.unit }), ...typed].join(' · ')
}

/** D2's magnifier. */
function SearchIcon() {
  return (
    <svg className="ingr-search-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

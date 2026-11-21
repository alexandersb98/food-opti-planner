import { useDeferredValue, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Ingredient } from '../../../api/types'
import { searchByName } from '../../../lists'
import { useT } from '../../i18n/i18n'
import { Sheet } from '../../ui/sheet/Sheet'
import './ingredient-picker.css'

export interface IngredientPickerProps {
  open: boolean
  /** Closed without a pick; set `open` to false. */
  onClose: () => void
  title: ReactNode
  ingredients: readonly Ingredient[]
  /** An ingredient was picked; set `open` to false. The same ingredient may
   * be picked again for another line, so the list never leaves one out. */
  onPick: (ingredient: Ingredient) => void
  /** What the search starts with each time the sheet opens (the import
   * review passes a line's food). */
  initialSearch?: string
  /** An extra action under the list (ticket 35's "+ New ingredient"). */
  extra?: ReactNode
  /** What to say when no ingredient matches the search; by default, to add
   * it on the Ingredients page. */
  noMatch?: (search: string) => string
  /** Where focus goes when the sheet closes; the opener by default. */
  finalFocus?: { readonly current: HTMLElement | null }
}

/**
 * D2's "Add to …" sheet: a search line over the ingredients, A to Z, each a
 * row to pick. Drawn at the end of the body, so it can be opened from inside
 * the recipe's form.
 */
export function IngredientPicker({
  open,
  onClose,
  title,
  ingredients,
  onPick,
  initialSearch = '',
  extra,
  noMatch,
  finalFocus,
}: IngredientPickerProps) {
  // A fresh search, from `initialSearch`, each time the sheet opens.
  const [opened, setOpened] = useState({ open, count: 0 })
  if (open !== opened.open) setOpened({ open, count: opened.count + (open ? 1 : 0) })
  const searchRef = useRef<HTMLInputElement>(null)

  return createPortal(
    <Sheet open={open} onClose={onClose} title={title} initialFocus={searchRef} finalFocus={finalFocus}>
      <PickerBody
        key={opened.count}
        ingredients={ingredients}
        onPick={onPick}
        initialSearch={initialSearch}
        noMatch={noMatch}
        searchRef={searchRef}
      />
      {extra ? <div className="picker-extra">{extra}</div> : null}
    </Sheet>,
    document.body,
  )
}

function PickerBody({
  ingredients,
  onPick,
  initialSearch,
  noMatch,
  searchRef,
}: Pick<IngredientPickerProps, 'ingredients' | 'onPick' | 'noMatch'> & {
  initialSearch: string
  searchRef: RefObject<HTMLInputElement | null>
}) {
  const t = useT()
  const id = useId()
  const [search, setSearch] = useState(initialSearch)
  const deferred = useDeferredValue(search)
  const shown = useMemo(() => searchByName(ingredients, deferred), [ingredients, deferred])

  return (
    <>
      <div className="picker-search">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <label className="visually-hidden" htmlFor={id}>
          {t('recipe.pickSearch')}
        </label>
        <input
          ref={searchRef}
          id={id}
          className="picker-search-in"
          type="search"
          placeholder={t('recipe.pickSearch')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            // Enter picks the only match; it never submits the recipe.
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (shown.length === 1) onPick(shown[0]!)
          }}
        />
      </div>
      {shown.length > 0 ? (
        <ul className="picker-list" aria-label={t('recipes.addIngredient')}>
          {shown.map((ingredient) => (
            <li key={ingredient.id}>
              <button type="button" className="picker-row" onClick={() => onPick(ingredient)}>
                <span className="picker-name">{ingredient.name}</span>{' '}
                <span className="picker-unit" translate="no">
                  {ingredient.unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="picker-none" role="status">
          {noMatch
            ? noMatch(search.trim())
            : ingredients.length === 0
              ? t('recipe.pickEmpty')
              : t('recipe.pickNone', { search: search.trim() })}
        </p>
      )}
    </>
  )
}

import { Fragment, useDeferredValue, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../../api/client'
import type { Attribute, Recipe, Tag } from '../../../api/types'
import { valueText } from '../../../format'
import { byId, filterByName, sortByName } from '../../../lists'
import { loadAll } from '../../../load'
import { useAiConfigured } from '../../hooks/useAiConfigured'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { attributesList, tagsList } from '../../stores/sharedLists'
import { Button } from '../../ui/button/Button'
import { Chip, Chips } from '../../ui/chips/Chips'
import { LoadState } from '../../ui/loadState/LoadState'
import { Plate } from '../../ui/plate/Plate'
import { AddMenu } from './AddMenu'
import { byLetter } from './letters'
import './recipe-index.css'

/** The recipe index: every recipe A to Z under letter headings, with a
 * search by name, quick tag chips and the add menu. */
export function RecipeIndex() {
  const t = useT()
  // The attributes and tags give the totals and tags their names.
  const page = useLoad((signal) =>
    loadAll({
      recipes: api.GET('/api/recipes', { signal }),
      attributes: attributesList.loadCall(),
      tags: tagsList.loadCall(),
    }),
  )
  // its own call, so the index never waits for it
  const aiConfigured = useAiConfigured()

  const [before, after] = t('recipes.index.title', { em: '\u0000' }).split('\u0000')
  return (
    <article className="recipes">
      <div className="cover recipes-cover">
        <p className="kicker">{page.data ? t('recipes.index.kicker', page.data.recipes.length) : ' '}</p>
        <h1 className="cover-title display recipes-title">
          {before}
          <em>{t('recipes.index.titleEm')}</em>
          {after}
        </h1>
        <p className="standfirst recipes-standfirst">{t('recipes.index.standfirst')}</p>
      </div>
      {page.data ? <Index {...page.data} /> : <LoadState of={page} message={t('recipes.loadFailed')} />}
      <AddMenu
        label={t('recipes.add')}
        items={[
          { to: '/recipes/new', label: t('recipes.new'), hint: t('recipes.index.newHint') },
          {
            to: '/recipes/import',
            label: t('recipes.import'),
            disabled: aiConfigured !== true,
            hint:
              aiConfigured === null
                ? t('recipes.index.checkingKey')
                : aiConfigured
                  ? t('recipes.index.importHint')
                  : t('recipes.needsKey'),
          },
        ]}
      />
    </article>
  )
}

/** What the index needs from the recipes and tags, worked out once when
 * they change, not on every keystroke in the search: the recipes A to Z,
 * each recipe's tags (from its ingredients or added by hand) as ids and as
 * a line of names in tag order, and the quick chips, every tag some recipe
 * has, in tag order. */
function indexOf(recipes: readonly Recipe[], tags: readonly Tag[]) {
  const used = new Set<number>()
  const tagsOf = new Map<number, { ids: ReadonlySet<number>; names: string }>()
  for (const recipe of recipes) {
    const ids = new Set([...recipe.derived_tag_ids, ...recipe.extra_tag_ids])
    for (const id of ids) used.add(id)
    const names = tags.flatMap((tag) => (ids.has(tag.id) ? [tag.name] : [])).join(', ')
    tagsOf.set(recipe.id, { ids, names })
  }
  const chipTags = tags.filter((tag) => used.has(tag.id))
  return { sorted: sortByName(recipes), tagsOf, chipTags }
}

function Index({ recipes, attributes, tags }: { recipes: Recipe[]; attributes: Attribute[]; tags: Tag[] }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set())
  const search = useRef<HTMLInputElement>(null)
  const { sorted, tagsOf, chipTags } = useMemo(() => indexOf(recipes, tags), [recipes, tags])
  const attributeById = useMemo(() => byId(attributes), [attributes])
  // The list follows the box a moment behind, so typing stays quick in a
  // long index.
  const deferredQuery = useDeferredValue(query)
  // the recipes matching the search and having every chosen tag
  const shown = useMemo(() => {
    const wanted = [...chosen]
    return filterByName(sorted, deferredQuery).filter((recipe) => {
      const has = tagsOf.get(recipe.id)!.ids
      return wanted.every((id) => has.has(id))
    })
  }, [sorted, tagsOf, deferredQuery, chosen])

  if (recipes.length === 0) {
    return (
      <div className="empty-state recipes-empty">
        <p>{t('recipes.empty')}</p>
        <p className="empty-state-hint">{t('recipes.index.emptyHint')}</p>
      </div>
    )
  }

  const narrowed = deferredQuery.trim() !== '' || chosen.size > 0

  function toggle(id: number) {
    setChosen((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function clear() {
    setQuery('')
    setChosen(new Set())
    search.current?.focus()
  }

  /** "Per portion: Energy 233 kcal · Protein 10.1 g", or nothing; each
   * value kept on one line, so a long line breaks between values. */
  function totals(recipe: Recipe) {
    const values = recipe.totals.flatMap(({ attribute_id, value }) => {
      const attribute = attributeById.get(attribute_id)
      return attribute ? [valueText(attribute, value)] : []
    })
    if (!values.length) return null
    const [before, after] = t('recipes.totalsLine', { totals: '\u0000' }).split('\u0000')
    return (
      <>
        {before}
        {values.map((text, i) => (
          <Fragment key={i}>
            {i > 0 ? ' · ' : null}
            <span className="recipes-value">{text}</span>
          </Fragment>
        ))}
        {after}
      </>
    )
  }

  return (
    <>
      <div className="recipes-search">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <label className="visually-hidden" htmlFor="recipes-search">
          {t('recipes.index.search')}
        </label>
        <input
          ref={search}
          id="recipes-search"
          className="recipes-search-input"
          type="search"
          name="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('recipes.index.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {chipTags.length > 0 ? (
        <Chips label={t('recipes.index.tags')} className="recipes-chips">
          {chipTags.map((tag) => (
            <Chip key={tag.id} pressed={chosen.has(tag.id)} onClick={() => toggle(tag.id)}>
              {tag.name}
            </Chip>
          ))}
        </Chips>
      ) : null}
      <p className="visually-hidden" role="status">
        {narrowed ? t('recipes.index.shown', shown.length) : ''}
      </p>
      {shown.length === 0 ? (
        <div className="empty-state recipes-empty">
          <p>{t('recipes.noMatch')}</p>
          <Button variant="text" onClick={clear}>
            {query.trim() ? t('recipes.index.clearSearch') : t('recipes.index.clearTags')}
          </Button>
        </div>
      ) : (
        byLetter(shown).map(({ letter, rows }) => (
          <section key={letter} className="recipes-letter-group" aria-labelledby={`recipes-letter-${letter}`}>
            <h2 className="recipes-letter" id={`recipes-letter-${letter}`}>
              {letter}
              <span className="recipes-letter-count">
                <span aria-hidden="true">{rows.length}</span>
                <span className="visually-hidden">, {t('shell.count.recipes', rows.length)}</span>
              </span>
            </h2>
            <ul className="recipes-list">
              {rows.map((recipe) => {
                const names = tagsOf.get(recipe.id)!.names
                const line = totals(recipe)
                return (
                  <li key={recipe.id}>
                    <Link className="recipes-entry" to={`/recipes/${recipe.id}`}>
                      <Plate id={recipe.id} variant="swatch" className="recipes-swatch" />
                      <span className="recipes-entry-text">
                        <span className="recipes-name">{recipe.name}</span>
                        {names ? <span className="recipes-tags">{names}</span> : null}
                        {line ? <span className="recipes-totals">{line}</span> : null}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </>
  )
}

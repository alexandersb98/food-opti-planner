import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../../api/client'
import type { Attribute, Recipe, Tag } from '../../../api/types'
import { valueText } from '../../../format'
import { byId, searchByName } from '../../../lists'
import { loadAll } from '../../../load'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
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
      attributes: api.GET('/api/attributes', { signal }),
      tags: api.GET('/api/tags', { signal }),
    }),
  )
  const aiConfigured = useAiConfigured()

  const [before, after] = t('recipes.index.title', { em: '\u0000' }).split('\u0000')
  return (
    <article className="recipes">
      <div className="recipes-cover">
        <p className="kicker">{page.data ? t('recipes.index.kicker', page.data.recipes.length) : ' '}</p>
        <h1 className="recipes-title display">
          {before}
          <em>{t('recipes.index.titleEm')}</em>
          {after}
        </h1>
        <p className="recipes-standfirst">{t('recipes.index.standfirst')}</p>
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

/** Whether import can run: null while the server is asked. Its own call, so
 * the index never waits for it; a failed or missing answer counts as no. */
function useAiConfigured() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  useEffect(() => {
    let current = true
    api.GET('/api/health').then(
      ({ data }) => current && setConfigured(data?.ai_configured === true),
      () => current && setConfigured(false),
    )
    return () => {
      current = false
    }
  }, [])
  return configured
}

/** A recipe's tags, from its ingredients or added by hand. */
function tagIds(recipe: Recipe) {
  return new Set([...recipe.derived_tag_ids, ...recipe.extra_tag_ids])
}

function Index({ recipes, attributes, tags }: { recipes: Recipe[]; attributes: Attribute[]; tags: Tag[] }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set())
  const search = useRef<HTMLInputElement>(null)

  if (recipes.length === 0) {
    return (
      <div className="recipes-empty">
        <p>{t('recipes.empty')}</p>
        <p className="recipes-empty-hint">{t('recipes.index.emptyHint')}</p>
      </div>
    )
  }

  const attributeById = byId(attributes)
  const tagsOf = new Map(recipes.map((recipe) => [recipe.id, tagIds(recipe)]))
  // the quick chips: every tag some recipe has, in tag order
  const used = new Set([...tagsOf.values()].flatMap((ids) => [...ids]))
  const chipTags = tags.filter((tag) => used.has(tag.id))
  // the recipes matching the search and having every chosen tag
  const shown = searchByName(recipes, query).filter((recipe) => {
    const has = tagsOf.get(recipe.id)!
    return [...chosen].every((id) => has.has(id))
  })
  const narrowed = query.trim() !== '' || chosen.size > 0

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
        <div className="recipes-empty">
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
                const has = tagsOf.get(recipe.id)!
                const names = tags.filter((tag) => has.has(tag.id)).map((tag) => tag.name)
                const line = totals(recipe)
                return (
                  <li key={recipe.id}>
                    <Link className="recipes-entry" to={`/recipes/${recipe.id}`}>
                      <Plate id={recipe.id} variant="swatch" className="recipes-swatch" />
                      <span className="recipes-entry-text">
                        <span className="recipes-name">{recipe.name}</span>
                        {names.length ? <span className="recipes-tags">{names.join(', ')}</span> : null}
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

import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { DataSourceSummary, FoodPreview, FoodSummary } from '../../../api/types'
import { usePreferences } from '../../hooks/usePreferences'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { preferencesStore } from '../../stores/preferences'
import { Button } from '../../ui/button/Button'
import { Chip, Chips } from '../../ui/chips/Chips'
import { Field, Fieldset } from '../../ui/field/Field'
import { LoadState } from '../../ui/loadState/LoadState'
import { Select } from '../../ui/select/Select'
import { Sheet } from '../../ui/sheet/Sheet'
import './add-from-source.css'

/** ms after the last key before a search is sent */
const SEARCH_DELAY = 300

/**
 * Add from data source, a full-screen sheet on the Ingredients page: pick a
 * data source (the last one is remembered on the server), search its foods
 * twenty at a time, and for a chosen food preview the ingredient it would
 * become, whose name and source tags may be changed. Add sends only the
 * food, the name and the tags: the server works out the unit, basis and
 * values from the mapping as it stands, and the new ingredient opens.
 * Its own chunk (see AddFromSourceEntry).
 */
export function AddFromSource({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean
  onClose: () => void
  returnFocus?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} fullScreen title={t('addFromSource.title')} finalFocus={returnFocus}>
      <Sources />
    </Sheet>
  )
}

/** The sources and the remembered one, loaded together; then the finder
 * for the chosen source. */
function Sources() {
  const t = useT()
  const sources = useLoad(async (signal) => {
    const [answer] = await Promise.all([api.GET('/api/data-sources', { signal }), preferencesStore.load()])
    return answer
  })
  const { preferences } = usePreferences()
  // the source picked here; until then the remembered one, or the first
  const [picked, setPicked] = useState<string | null>(null)

  if (!sources.data) return <LoadState of={sources} message={t('settings.dataSources.loadFailed')} />
  const list = sources.data
  const remembered = preferences?.last_data_source
  const source = list.find((s) => s.key === picked) ?? list.find((s) => s.key === remembered) ?? list[0]
  if (!source) return <p className="afs-quiet">{t('addFromSource.noSources')}</p>

  const choose = (key: string) => {
    if (key === source.key) return
    setPicked(key)
    void preferencesStore.set('last_data_source', key) // a failed save is silent
  }

  return (
    <div className="afs">
      <Finder
        source={source}
        picker={
          <Field label={t('addFromSource.dataSource')}>
            {(control) => (
              <Select
                {...control}
                value={source.key}
                onValueChange={choose}
                options={list.map((s) => ({ value: s.key, label: s.name }))}
              />
            )}
          </Field>
        }
      />
    </div>
  )
}

interface Answer {
  /** The source the foods are from. */
  key: string
  /** The search the answer is for (source, text and attempt). */
  search: string
  foods: FoodSummary[]
  total: number
  failed: boolean
}

const NO_ANSWER: Answer = { key: '', search: '', foods: [], total: 0, failed: false }

/** The foods matching the search, a page at a time. Only the answer to the
 * latest request counts: a newer search (or leaving) aborts and ignores
 * the one before. The foods shown stay until a new search answers, except
 * that another source starts with none. */
function useFoodSearch(sourceKey: string, query: string) {
  // Try again asks for the same search once more.
  const [attempt, setAttempt] = useState(0)
  const search = JSON.stringify([sourceKey, query, attempt])
  const [answer, setAnswer] = useState<Answer>(NO_ANSWER)
  const [loadingMore, setLoadingMore] = useState(false)
  const running = useRef<AbortController | null>(null)

  function fetchFoods(offset: number) {
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    const settle = (page: { foods: FoodSummary[]; total: number } | undefined) => {
      if (controller.signal.aborted) return
      running.current = null
      setLoadingMore(false)
      setAnswer((was) =>
        page
          ? { key: sourceKey, search, foods: offset === 0 ? page.foods : [...was.foods, ...page.foods], total: page.total, failed: false }
          : { ...(was.key === sourceKey ? was : NO_ANSWER), key: sourceKey, search, failed: true },
      )
    }
    api
      .GET('/api/data-sources/{key}/foods', {
        params: { path: { key: sourceKey }, query: { search: query, offset } },
        signal: controller.signal,
      })
      .then(
        ({ data }) => settle(data),
        () => settle(undefined),
      )
  }

  const firstPage = useEffectEvent(() => fetchFoods(0))
  useEffect(() => {
    firstPage()
    return () => running.current?.abort()
  }, [search])

  const sameSource = answer.key === sourceKey
  const current = answer.search === search
  return {
    foods: sameSource ? answer.foods : [],
    total: sameSource ? answer.total : 0,
    searching: !current || loadingMore,
    failed: current && answer.failed && !loadingMore,
    more: () => {
      setLoadingMore(true)
      fetchFoods(answer.foods.length)
    },
    retry: () => setAttempt((was) => was + 1),
  }
}

/** The source, the search and its results, and the chosen food in their
 * place. The results stay on the page (hidden) while a food is shown, so Back to
 * results finds them, the search and the scroll as they were. */
function Finder({ source, picker }: { source: DataSourceSummary; picker: ReactNode }) {
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

/** The name and tags as edited; until the first edit, the preview's. */
interface Edits {
  name: string
  tagIds: ReadonlySet<number>
}

/** The chosen food: the ingredient it would become, its name and tags to
 * change, what is not copied, an earlier ingredient from the same food,
 * and Add. */
function FoodToAdd({ source, food, onBack }: { source: DataSourceSummary; food: FoodSummary; onBack: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const preview = useLoad((signal) =>
    api.GET('/api/data-sources/{key}/foods/{food_id}', { params: { path: { key: source.key, food_id: food.id } }, signal }),
  )
  const [edits, setEdits] = useState<Edits | null>(null)
  const [errors, setErrors] = useState<{ name?: string; save?: string }>({})
  const [adding, setAdding] = useState(false)
  const busy = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const tagsId = useId()

  // the food takes the results' place: focus moves to its name
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const data = preview.data
  const name = edits?.name ?? data?.suggested_name ?? ''
  const tagIds = edits?.tagIds ?? new Set(data?.groups.map((group) => group.tag_id))
  const edit = (change: Partial<Edits>) => setEdits({ name, tagIds, ...change })

  const toggleTag = (tagId: number) => {
    const next = new Set(tagIds)
    if (!next.delete(tagId)) next.add(tagId)
    edit({ tagIds: next })
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!data || busy.current) return
    setErrors({})
    const typed = name.trim()
    if (!typed) {
      setErrors({ name: t('common.nameRequired') })
      nameRef.current?.focus()
      return
    }
    busy.current = true
    setAdding(true)
    try {
      const { data: added, error } = await api.POST('/api/ingredients/from-source', {
        body: {
          food_id: data.id,
          name: typed,
          tag_ids: data.groups.filter((group) => tagIds.has(group.tag_id)).map((group) => group.tag_id),
        },
      })
      if (added) {
        void navigate(`/ingredients/${added.id}`)
        return
      }
      const byField = fieldErrors(error)
      if (byField.name === 'name_in_use') {
        setErrors({ name: t('ingredients.nameInUse') })
        nameRef.current?.focus()
      } else if (byField.food_id === 'withdrawn') {
        preview.reload() // the preview now says so, and Add is off
      } else {
        setErrors({ save: t('common.saveFailed') })
      }
    } catch {
      setErrors({ save: t('common.saveFailed') })
    } finally {
      busy.current = false
      setAdding(false)
    }
  }

  return (
    <section className="afs-chosen" aria-labelledby={`${tagsId}-food`}>
      <p className="afs-from">
        <span className="afs-dot" aria-hidden="true" style={{ backgroundColor: data?.source.colour ?? source.colour }} />
        {t('addFromSource.from', { source: data?.source.name ?? source.name })}
      </p>
      <h3 ref={headingRef} id={`${tagsId}-food`} className="afs-food-title" tabIndex={-1}>
        {data?.name ?? food.name}
      </h3>
      {!data ? (
        <>
          <LoadState of={preview} message={t('addFromSource.loadFoodFailed')} />
          <div className="sheet-actions">
            <button type="button" className="sheet-btn sheet-btn-ghost" onClick={onBack}>
              {t('addFromSource.backToResults')}
            </button>
          </div>
        </>
      ) : (
        <Preview
          preview={data}
          name={name}
          tagIds={tagIds}
          errors={errors}
          adding={adding}
          nameRef={nameRef}
          onName={(value) => edit({ name: value })}
          onToggleTag={toggleTag}
          onSubmit={add}
          onBack={onBack}
        />
      )}
    </section>
  )
}

function Preview({
  preview,
  name,
  tagIds,
  errors,
  adding,
  nameRef,
  onName,
  onToggleTag,
  onSubmit,
  onBack,
}: {
  preview: FoodPreview
  name: string
  tagIds: ReadonlySet<number>
  errors: { name?: string; save?: string }
  adding: boolean
  nameRef: RefObject<HTMLInputElement | null>
  onName: (name: string) => void
  onToggleTag: (tagId: number) => void
  onSubmit: (event: FormEvent) => void
  onBack: () => void
}) {
  const t = useT()
  return (
    <form className="afs-form" onSubmit={onSubmit} noValidate>
      <Field label={t('common.name')} error={errors.name}>
        {(control) => (
          <input
            {...control}
            ref={nameRef}
            className="afs-name"
            name="name"
            autoComplete="off"
            value={name}
            onChange={(event) => onName(event.target.value)}
          />
        )}
      </Field>

      <div className="afs-copied">
        <p className="sheet-preview afs-measured">{t('addFromSource.measured', { unit: preview.unit, basis: preview.basis })}</p>
        {preview.values.length > 0 ? (
          <dl className="afs-values">
            {preview.values.map((value) => (
              <div key={value.attribute_id} className="afs-value">
                <dt>{value.attribute_name}</dt>
                <dd>
                  {value.value} {value.attribute_unit}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="afs-quiet">{t('addFromSource.valuesNone')}</p>
        )}
        {preview.skipped.length > 0 ? (
          <p className="afs-skipped">{t('addFromSource.skipped', { names: preview.skipped.join(', ') })}</p>
        ) : null}
      </div>

      <Fieldset legend={t('addFromSource.tags')}>
        {preview.groups.length === 0 ? (
          <p className="afs-quiet">{t('addFromSource.noTags')}</p>
        ) : (
          <Chips>
            {preview.groups.map((group) => (
              <Chip key={group.tag_id} pressed={tagIds.has(group.tag_id)} onClick={() => onToggleTag(group.tag_id)}>
                {group.name}
              </Chip>
            ))}
          </Chips>
        )}
      </Fieldset>

      {preview.existing.length > 0 ? (
        <p className="afs-note">{t('addFromSource.duplicate', { names: preview.existing.map((e) => e.name).join(', ') })}</p>
      ) : null}
      {preview.withdrawn ? (
        <p className="afs-alert" role="alert">
          {t('addFromSource.withdrawn')}
        </p>
      ) : null}
      {errors.save ? (
        <p className="afs-alert" role="alert">
          {errors.save}
        </p>
      ) : null}

      <div className="sheet-actions">
        <button type="button" className="sheet-btn sheet-btn-ghost" onClick={onBack}>
          {t('addFromSource.backToResults')}
        </button>
        <button type="submit" className="sheet-btn sheet-btn-primary" disabled={preview.withdrawn} aria-busy={adding}>
          {t('addFromSource.add')}
        </button>
      </div>
    </form>
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

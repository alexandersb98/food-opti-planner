import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { DataSourceSummary, FoodPreview, FoodSummary } from '../../../api/types'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'
import { Chip, Chips } from '../../ui/chips/Chips'
import { Field, Fieldset } from '../../ui/field/Field'
import { LoadState } from '../../ui/loadState/LoadState'

/** The name and tags as edited; until the first edit, the preview's. */
interface Edits {
  name: string
  tagIds: ReadonlySet<number>
}

/** The chosen food: the ingredient it would become, its name and tags to
 * change, what is not copied, an earlier ingredient from the same food,
 * and Add. */
export function FoodToAdd({ source, food, onBack }: { source: DataSourceSummary; food: FoodSummary; onBack: () => void }) {
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
            <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={onBack}>
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
        <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={onBack}>
          {t('addFromSource.backToResults')}
        </button>
        <button type="submit" className={buttonClass({ variant: 'primary' })} disabled={preview.withdrawn} aria-busy={adding}>
          {t('addFromSource.add')}
        </button>
      </div>
    </form>
  )
}

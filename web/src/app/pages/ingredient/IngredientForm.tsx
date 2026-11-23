import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api } from '../../../api/client'
import { conversionRefusal, fieldErrors } from '../../../api/errors'
import type { Attribute, Ingredient, IngredientFields, Recipe, Tag } from '../../../api/types'
import { searchByName } from '../../../lists'
import { loadAll } from '../../../load'
import { typedNumber } from '../../../numbers'
import { useLoad } from '../../hooks/useLoad'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { useRunningHead } from '../../shell/runningHead'
import { preferencesStore, preferredUnit } from '../../stores/preferences'
import { attributesList, tagsList } from '../../stores/sharedLists'
import { Button, buttonClass } from '../../ui/button/Button'
import { TagPicker } from '../../ui/tagPicker/TagPicker'
import { useConfirm } from '../../ui/confirm/Confirm'
import { Field } from '../../ui/field/Field'
import { LoadState } from '../../ui/loadState/LoadState'
import { UnitField, type UnitGroup } from '../../ui/unit-field/UnitField'
import { Conversions } from './Conversions'
import './ingredient.css'
import { IngredientSource } from './IngredientSource'
import { UpdatedValues } from './UpdatedValues'
import { useIngredientUnitChange } from './unitChangeCheck'

// The form of a new ingredient (id null) or an existing one: name, the unit
// it is measured in, the value basis, a value per attribute and its tags.
// The host decides where to go after a save or a delete: the ingredient page
// (/ingredients/:id) or a sheet (ticket 35's "+ New ingredient", with the
// line's food as `initialName`).
//
// Places left for later tickets, one line each: the source link and the
// updated-values banner (ticket 31), the conversions (ticket 30) and the
// unit-change question (ticket 37). Search for "Ticket 3".

export interface IngredientFormProps {
  /** The ingredient to edit, or null for a new one. */
  id: number | null
  /** A new ingredient's starting name. */
  initialName?: string
  /** After a save, with the stored ingredient. */
  onSaved: (ingredient: Ingredient) => void
  /** After a delete, with the ingredient as it was. */
  onDeleted?: (ingredient: Ingredient) => void
  /** In a sheet: no page heading or back link, and Save at the foot. */
  inSheet?: boolean
}

interface Loaded {
  attributes: Attribute[]
  tags: Tag[]
  ingredient: Ingredient | null
}

/** The fields as typed; values by attribute id, empty or missing when not typed. */
interface Draft {
  name: string
  unit: string
  basis: string
  values: Partial<Record<number, string>>
  tagIds: ReadonlySet<number>
}

interface Errors {
  name?: string
  unit?: string
  basis?: string
  values: Partial<Record<number, string>>
  /** A failed save, for the whole form. */
  save?: string
}

/** What the unit-change question (ticket 37) answers: go on with the save,
 * or stop with a refusal under the unit or a failed preview. */
interface UnitChangeAnswer {
  go: boolean
  unitError?: string
  saveError?: string
}

const NO_ERRORS: Errors = { values: {} }
const ALL_KINDS: readonly UnitGroup[] = ['mass', 'volume', 'piece']
const MASS_ONLY: readonly UnitGroup[] = ['mass']

/** The attributes, the tags and the ingredient, at once. A new ingredient
 * starts in the preferred mass unit, so the preferences are loaded too (a
 * failed load starts it in grams). */
async function loadIngredient(id: number | null, signal: AbortSignal) {
  const [loaded] = await Promise.all([
    loadAll({
      attributes: attributesList.loadCall(),
      tags: tagsList.loadCall(),
      ingredient:
        id === null
          ? Promise.resolve({ data: null })
          : api.GET('/api/ingredients/{ingredient_id}', { params: { path: { ingredient_id: id } }, signal }),
    }),
    preferencesStore.load(),
  ])
  return loaded
}

/** The ingredient form, loading what it needs first. */
export function IngredientForm(props: IngredientFormProps) {
  const t = useT()
  const { id } = props
  const page = useLoad((signal) => loadIngredient(id, signal), id ?? 'new')
  if (!page.data) return <LoadState of={page} message={t('ingredients.loadOneFailed')} />
  return <IngredientEditor key={id ?? 'new'} loaded={page.data} {...props} />
}

function startDraft(loaded: Loaded, initialName: string | undefined): Draft {
  const { ingredient } = loaded
  if (ingredient) {
    return {
      name: ingredient.name,
      unit: ingredient.unit,
      basis: ingredient.basis,
      values: Object.fromEntries(ingredient.values.map(({ attribute_id, value }) => [attribute_id, value])),
      tagIds: new Set(ingredient.tag_ids),
    }
  }
  const unit = preferredUnit(preferencesStore.getSnapshot().preferences, 'mass') ?? 'g'
  return { name: initialName ?? '', unit, basis: '100', values: {}, tagIds: new Set() } // a mass unit: per 100
}

function IngredientEditor({
  loaded,
  initialName,
  onSaved,
  onDeleted,
  inSheet = false,
}: IngredientFormProps & { loaded: Loaded }) {
  const t = useT()
  const { attributes, tags } = loaded
  const { units, basisFor: catalogueBasis } = useUnits()
  const [confirm, confirmSheet] = useConfirm()
  const [checkUnitChange, unitChangeSheet] = useIngredientUnitChange()
  const ids = useId()
  const formRef = useRef<HTMLFormElement>(null)

  // The ingredient as the server last sent it (null until a new one is saved).
  const [stored, setStored] = useState(loaded.ingredient)
  const [draft, setDraft] = useState(() => startDraft(loaded, initialName))
  const [errors, setErrors] = useState<Errors>(NO_ERRORS)
  const [saving, setSaving] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)
  // Counts failed checks, so focus moves to the first marked field after each.
  const [checks, setChecks] = useState(0)
  useRunningHead(inSheet ? null : stored?.name)

  useEffect(() => {
    if (checks === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [checks])

  // A linked ingredient is measured in mass units only (its values are per 100 g).
  const linked = stored?.source != null
  const kinds = linked ? MASS_ONLY : ALL_KINDS

  /** The default basis of a unit; without the catalogue only g is known. */
  function basisFor(unit: string) {
    if (units.length > 0) return catalogueBasis(unit)
    return unit.trim() === 'g' ? '100' : '1'
  }

  /** The basis follows the unit (100 g, 1 st) unless it was changed by hand. */
  function changeUnit(unit: string) {
    setDraft((d) => ({ ...d, unit, basis: d.basis.trim() === basisFor(d.unit) ? basisFor(unit) : d.basis }))
    setErrors((e) => ({ ...e, unit: undefined }))
  }

  function changeValue(attributeId: number, text: string) {
    setDraft((d) => ({ ...d, values: { ...d.values, [attributeId]: text } }))
    setErrors((e) => ({ ...e, values: { ...e.values, [attributeId]: undefined } }))
  }

  function toggleTag(tagId: number) {
    setDraft((d) => {
      const tagIds = new Set(d.tagIds)
      if (!tagIds.delete(tagId)) tagIds.add(tagId)
      return { ...d, tagIds }
    })
  }

  /** The fields to send, or null after marking what is wrong. */
  function checked(): IngredientFields | null {
    const fields: IngredientFields = {
      name: draft.name.trim(),
      unit: draft.unit.trim(),
      basis: typedNumber(draft.basis) ?? '',
      values: [],
      tag_ids: tags.filter((tag) => draft.tagIds.has(tag.id)).map((tag) => tag.id),
    }
    const found: Errors = { values: {} }
    if (!fields.name) found.name = t('common.nameRequired')
    if (!fields.unit) found.unit = t('ingredients.unitRequired')
    if (!fields.basis || !(Number(fields.basis) > 0)) found.basis = t('ingredients.basisInvalid')
    for (const attribute of attributes) {
      const typed = draft.values[attribute.id]?.trim() ?? ''
      if (typed === '') continue // empty means 0
      const value = typedNumber(typed)
      if (value === null) found.values[attribute.id] = t('ingredients.numberInvalid')
      else fields.values.push({ attribute_id: attribute.id, value })
    }
    const wrong = found.name || found.unit || found.basis || Object.keys(found.values).length > 0
    setErrors(found)
    if (wrong) setChecks((n) => n + 1)
    return wrong ? null : fields
  }

  /** A name in use, a unit not for an ingredient (or not mass for a linked
   * one), a refused unit change, or a number with too many digits, each on
   * its field; anything else just failed. */
  function showServerErrors(error: unknown, fields: IngredientFields) {
    const byField = fieldErrors(error)
    const refusal = conversionRefusal(error)
    const found: Errors = { values: {} }
    if (byField.name === 'name_in_use') found.name = t('ingredients.nameInUse')
    if (byField.unit === 'unit_not_for_ingredient') found.unit = t('ingredients.unitNotForIngredient')
    if (byField.unit === 'unit_not_for_source') found.unit = t('ingredients.unitNotForSource')
    if (refusal) found.unit = refusal
    if (byField.basis) found.basis = t('ingredients.numberTooLong')
    fields.values.forEach(({ attribute_id }, i) => {
      if (byField[`values.${i}.value`]) found.values[attribute_id] = t('ingredients.numberTooLong')
    })
    const shown = found.name || found.unit || found.basis || Object.keys(found.values).length > 0
    if (!shown) found.save = t('common.saveFailed')
    setErrors(found)
    if (shown) setChecks((n) => n + 1)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const fields = checked()
    if (!fields) return
    if (stored && fields.unit !== stored.unit) {
      // The unit-change question (ticket 37): the preview, a refusal under the unit, or the sheet.
      const answer: UnitChangeAnswer = await checkUnitChange(stored, fields)
      if (!answer.go) {
        setErrors({ values: {}, unit: answer.unitError, save: answer.saveError })
        if (answer.unitError) setChecks((n) => n + 1)
        return
      }
    }
    setSaving(true)
    try {
      const { data: saved, error } = stored
        ? await api.PUT('/api/ingredients/{ingredient_id}', { params: { path: { ingredient_id: stored.id } }, body: fields })
        : await api.POST('/api/ingredients', { body: fields })
      if (saved) {
        setStored(saved)
        onSaved(saved)
        return
      }
      showServerErrors(error, fields)
    } catch {
      setErrors({ values: {}, save: t('common.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!stored) return
    const count = stored.conversions.length
    const ok = await confirm({
      title: t('common.deleteTitle', { name: stored.name }),
      message: (
        <>
          <p>{count > 0 ? t('ingredients.deleteConversions', { n: count }, count) : t('common.deleteNothing')}</p>
          {count > 0 ? (
            <ul className="ingredient-delete-list">
              {stored.conversions.map((conversion) => (
                <li key={conversion.id}>
                  {t('conversions.row', { unit: conversion.unit, factor: conversion.factor, own: stored.unit })}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    setDeleteFailed(false)
    try {
      const { response } = await api.DELETE('/api/ingredients/{ingredient_id}', {
        params: { path: { ingredient_id: stored.id } },
      })
      if (response.ok) {
        onDeleted?.(stored)
        return
      }
    } catch {
      // said below
    }
    setDeleteFailed(true)
  }

  const nameField = (
    <Field
      label={t('common.name')}
      hideLabel={!inSheet}
      error={errors.name}
      className={inSheet ? 'ingredient-name ingredient-name-small' : 'ingredient-name'}
    >
      {(control) => (
        <input
          {...control}
          name="name"
          autoComplete="off"
          placeholder={inSheet ? undefined : t('common.name')}
          value={draft.name}
          // a new ingredient starts on its name; not on a touch screen, where the keyboard would cover the page
          autoFocus={stored === null && !window.matchMedia?.('(pointer: coarse)').matches}
          onChange={(event) => {
            const name = event.target.value
            setDraft((d) => ({ ...d, name }))
            setErrors((e) => ({ ...e, name: undefined }))
          }}
        />
      )}
    </Field>
  )

  const saveButton = (
    <Button type="submit" variant={inSheet ? 'primary' : 'accent'} small={!inSheet} disabled={saving}>
      {t('common.save')}
    </Button>
  )

  const saveError = errors.save ? (
    <p className="ingredient-alert" role="alert">
      {errors.save}
    </p>
  ) : null

  // The conversions (ticket 30 lists them for a saved ingredient on this line;
  // a new one in a sheet leaves them out).
  const conversions: ReactNode = stored ? <Conversions ingredient={stored} onChange={(list) => setStored((s) => (s ? { ...s, conversions: list } : s))} /> : inSheet ? null : <p className="ingredient-note">{t('conversions.saveFirst')}</p>

  const basisId = `${ids}-basis`
  const basisErrorId = `${ids}-basis-error`

  return (
    <form ref={formRef} className={inSheet ? 'ingredient ingredient-in-sheet' : 'ingredient'} noValidate onSubmit={save}>
      {inSheet ? null : (
        <div className="ingredient-bar">
          <Link className={buttonClass({ variant: 'text-plain' })} to="/ingredients">
            {t('ingredients.page.back')}
          </Link>
          {saveButton}
          {saveError}
        </div>
      )}

      <div className="ingredient-head">
        {inSheet ? null : <h1 className="kicker ingredient-kicker">{stored ? t('ingredients.edit') : t('ingredients.new')}</h1>}
        {nameField}
        <IngredientSource ingredient={stored} onChange={setStored} />

        <div className="ingredient-measure">
          <UnitField label={t('ingredients.measuredIn')} value={draft.unit} onChange={changeUnit} kinds={kinds} error={errors.unit} />
          <div className="ingredient-basis">
            <span className="ingredient-basis-line">
              <span aria-hidden="true">{t('ingredients.valuesPer')}</span>
              <input
                id={basisId}
                name="basis"
                className="ingredient-number"
                inputMode="decimal"
                autoComplete="off"
                aria-label={t('ingredients.basis')}
                aria-invalid={errors.basis ? true : undefined}
                aria-describedby={errors.basis ? basisErrorId : undefined}
                value={draft.basis}
                onChange={(event) => {
                  const basis = event.target.value
                  setDraft((d) => ({ ...d, basis }))
                  setErrors((e) => ({ ...e, basis: undefined }))
                }}
              />
              <span className="ingredient-unit" translate="no">
                {draft.unit.trim()}
              </span>
            </span>
            {errors.basis ? (
              <p id={basisErrorId} className="field-error" role="alert">
                {errors.basis}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <UpdatedValues ingredient={stored} attributes={attributes} onAnswered={(answered, fill) => { setStored(answered); setDraft((d) => ({ ...d, values: fill(d.values) })) }} />

      <section className="ingredient-section" aria-labelledby={`${ids}-values`}>
        <SectionHead number="i" id={`${ids}-values`}>
          {t('ingredients.page.values')}
        </SectionHead>
        {attributes.length === 0 ? (
          <p className="ingredient-note">{t('ingredients.noAttributes')}</p>
        ) : (
          <>
            <div className="ingredient-values">
              {attributes.map((attribute) => (
                <ValueRow
                  key={attribute.id}
                  attribute={attribute}
                  value={draft.values[attribute.id] ?? ''}
                  error={errors.values[attribute.id]}
                  onChange={changeValue}
                />
              ))}
            </div>
            <p className="ingredient-note">{t('ingredients.valuesHint')}</p>
          </>
        )}
      </section>

      <section className="ingredient-section" aria-labelledby={`${ids}-tags`}>
        <SectionHead number="ii" id={`${ids}-tags`}>
          {t('ingredients.tags')}
        </SectionHead>
        {tags.length === 0 ? (
          <p className="ingredient-note">{t('ingredients.noTags')}</p>
        ) : (
          <TagPicker labelledBy={`${ids}-tags`} tags={tags} chosen={draft.tagIds} onToggle={toggleTag} />
        )}
      </section>

      {conversions ? (
        <section className="ingredient-section" aria-labelledby={`${ids}-conversions`}>
          <SectionHead number="iii" id={`${ids}-conversions`}>
            {t('conversions.title')}
          </SectionHead>
          {conversions}
        </section>
      ) : null}

      {stored ? <IngredientUse ingredient={stored} onDelete={remove} deleteFailed={deleteFailed} /> : null}

      {inSheet ? (
        <>
          {saveError}
          <div className="sheet-actions">{saveButton}</div>
        </>
      ) : null}
      {confirmSheet}
      {unitChangeSheet}
    </form>
  )
}

function SectionHead({ number, id, children }: { number: string; id: string; children: ReactNode }) {
  return (
    <div className="ingredient-section-head">
      <span className="ingredient-section-no" aria-hidden="true">
        {number}
      </span>
      <h2 className="ingredient-section-title" id={id}>
        {children}
      </h2>
    </div>
  )
}

/** One attribute's value: its name, the number and the attribute's unit. */
function ValueRow({
  attribute,
  value,
  error,
  onChange,
}: {
  attribute: Attribute
  value: string
  error: string | undefined
  onChange: (attributeId: number, text: string) => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="ingredient-value">
      <label htmlFor={id} className="ingredient-value-name">
        {attribute.name}
      </label>
      <input
        id={id}
        name={`value-${attribute.id}`}
        className="ingredient-number"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(event) => onChange(attribute.id, event.target.value)}
      />
      <span className="ingredient-unit" translate="no">
        {attribute.unit}
      </span>
      {error ? (
        <p id={errorId} className="field-error ingredient-value-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** "Used in 2 recipes · Show", the recipes when asked for, and Delete,
 * refused while recipes use the ingredient. */
function IngredientUse({
  ingredient,
  onDelete,
  deleteFailed,
}: {
  ingredient: Ingredient
  onDelete: () => void
  deleteFailed: boolean
}) {
  const t = useT()
  const ids = useId()
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const inUse = ingredient.recipe_count > 0

  async function show() {
    setFailed(false)
    setAsking(true)
    try {
      const { data } = await api.GET('/api/recipes')
      if (!data) throw new Error('no recipes')
      const uses = (recipe: Recipe) =>
        recipe.sections.some((section) => section.items.some((item) => item.ingredient_id === ingredient.id))
      setRecipes(searchByName(data.filter(uses), ''))
    } catch {
      setFailed(true)
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="ingredient-use">
      <p className="ingredient-used">
        <span id={`${ids}-used`}>{t('ingredients.usedIn', { recipes: t('count.recipes', ingredient.recipe_count) })}</span>
        {inUse && recipes === null ? (
          <>
            <span className="ingredient-dot" aria-hidden="true">
              ·
            </span>
            <Button variant="text" onClick={show} disabled={asking}>
              {t('ingredients.show')}
            </Button>
          </>
        ) : null}
      </p>
      {failed ? (
        <p className="field-error" role="alert">
          {t('ingredients.usedInLoadFailed')}
        </p>
      ) : null}
      {recipes ? (
        <ul className="ingredient-recipes" aria-label={t('ingredients.page.usedInList', { name: ingredient.name })}>
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="ingredient-delete">
        <Button small disabled={inUse} aria-describedby={inUse ? `${ids}-in-use` : undefined} onClick={onDelete}>
          {t('common.delete')}
        </Button>
        {inUse ? (
          <p id={`${ids}-in-use`} className="ingredient-note">
            {t('ingredients.inUse')}
          </p>
        ) : null}
        {deleteFailed ? (
          <p className="field-error" role="alert">
            {t('common.deleteFailed')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

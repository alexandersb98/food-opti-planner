import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Attribute, ImportedRecipe, Ingredient, Recipe, Tag } from '../../../api/types'
import { ingredientWithPending } from '../../../importReview'
import { lineFactor } from '../../../lineUnits'
import { typedNumber } from '../../../numbers'
import { servingsOf, type DraftLine } from '../../../recipeDraft'
import { portionTotals } from '../../../totals'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { TagPicker } from '../../ui/tagPicker/TagPicker'
import { useConfirm } from '../../ui/confirm/Confirm'
import { Disclosure } from '../../ui/disclosure/Disclosure'
import { Field, Fieldset } from '../../ui/field/Field'
import { Segmented } from '../../ui/segmented/Segmented'
import { useImportReview } from './ImportReview'
import { LeaveGuard } from './LeaveGuard'
import { SectionHead } from './SpreadView'
import { LineEditor } from './LineEditor'
import { spreadTags } from './spread'
import { useRecipeDraft, type TextField } from './useRecipeDraft'

/** The edit mode's form; the bar's Save (outside it, in RecipeSpread)
 * submits it by this id. */
export const EDITOR_FORM_ID = 'spread-editor'

export interface SpreadEditorProps {
  /** The stored recipe; null for a new one (/recipes/new). */
  recipe: Recipe | null
  attributes: Attribute[]
  tags: Tag[]
  ingredients: ReadonlyMap<number, Ingredient>
  /** An imported recipe to review (ticket 35): the banner above the head,
   * each line's review, Save waiting for every line, and leaving asks. */
  imported?: ImportedRecipe | null
  /** Stored: the page leaves edit mode (or opens the new recipe). */
  onSaved: (recipe: Recipe) => void
  /** Deleted after confirming: the page leaves for the index. */
  onDeleted?: (recipe: Recipe) => void
  /** Whether a save is under way, for the bar's Save. */
  onSavingChange?: (saving: boolean) => void
  /** An ingredient gained a conversion from a line's "New unit…": the page
   * keeps it, so the lines and totals count it. */
  onIngredientChanged: (ingredient: Ingredient) => void
}

/**
 * The spread's edit mode, "annotating the page" (D2): the name, servings,
 * portion size and its advanced settings, the method as one text, the tags
 * as chips and the source, each underlined in red pencil with its error on
 * it; Delete at the foot. The bar's Save submits it. The ingredient lines
 * are ticket 33's `LineEditor`; an imported draft is reviewed (ticket 35's
 * `useImportReview`).
 */
export function SpreadEditor({
  recipe,
  attributes,
  tags,
  ingredients,
  imported = null,
  onSaved,
  onDeleted,
  onSavingChange,
  onIngredientChanged,
}: SpreadEditorProps) {
  const t = useT()
  const units = useUnits()
  const [confirm, confirmSheet] = useConfirm()
  const { draft, errors, saving, marked, derivedTagIds, defaultHardMax, set, setInSteps, toggleTag, edit, save, remove } = useRecipeDraft({
    recipe,
    imported,
  })
  const [deleteFailed, setDeleteFailed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const review = useImportReview({ draft, edit, ingredients, ratio: units.ratio, onIngredientChanged, formRef })
  // Set once the recipe is saved, so leaving after it doesn't ask.
  const done = useRef(false)
  // Open from the start when it holds something other than the defaults.
  const [advancedSet] = useState(() => draft.hardMax !== '' || draft.penalty !== '1')

  // Into edit mode, the writing starts at the name (D2); on a touch screen
  // the page's title takes the focus instead, so no keyboard pops up.
  useEffect(() => {
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
    ;(touch ? titleRef.current : nameRef.current)?.focus({ preventScroll: true })
  }, [])
  useEffect(() => onSavingChange?.(saving), [saving, onSavingChange])
  // After a check that marked a field, the focus goes to the first one.
  useEffect(() => {
    if (marked > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [marked])

  /** Whether a line's unit converts to its ingredient's; without the
   * catalogue the page can't tell, so the server decides. */
  function converts(line: DraftLine) {
    if (units.units.length === 0 || line.ingredientId === null) return true
    const ingredient = ingredients.get(line.ingredientId)
    return !ingredient || lineFactor(units.ratio, ingredientWithPending(ingredient, draft.pending), line.unit) !== null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (review && review.needs > 0) return review.refuse()
    const saved = await save(tags, converts)
    if (!saved) return
    done.current = true
    onSaved(saved)
  }

  async function askDelete() {
    if (!recipe) return
    const ok = await confirm({
      title: t('common.deleteTitle', { name: recipe.name }),
      message: <p>{t('recipe.deleteMessage')}</p>,
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    setDeleteFailed(false)
    if (await remove()) onDeleted?.(recipe)
    else setDeleteFailed(true)
  }

  // Live totals for one portion: the kept lines whose amount is a number,
  // divided by the servings as typed (1 while they aren't valid).
  const { sections, pending, servings: servingsText } = draft
  const servings = servingsOf(servingsText) ?? 1
  const totals = useMemo(() => {
    const amounts = sections.flatMap((section) =>
      section.items.flatMap(({ ingredientId, amount, unit, skipped }) => {
        const ingredient = skipped || ingredientId === null ? undefined : ingredients.get(ingredientId)
        const number = typedNumber(amount)
        return ingredient && number !== null ? [{ ingredient, amount: number, unit }] : []
      }),
    )
    return portionTotals(amounts, attributes, servings, (ingredient, unit) =>
      lineFactor(units.ratio, ingredientWithPending(ingredient, pending), unit),
    )
  }, [sections, pending, servings, attributes, ingredients, units.ratio])

  const first = recipe ? spreadTags(recipe, tags)[0]?.tag.name : undefined
  const derived = new Set(derivedTagIds)

  /** The props of an annotated text input for `field`. */
  const text = (field: TextField) => ({
    value: draft[field],
    onChange: (event: { target: { value: string } }) => set(field, event.target.value),
  })

  return (
    <form id={EDITOR_FORM_ID} ref={formRef} className="spread-editor" noValidate onSubmit={submit} data-no-swipe="">
      {errors.save ? (
        <p className="spread-save-error" role="alert">
          {errors.save}
        </p>
      ) : null}

      {review?.banner}
      <div className="spread-head">
        <h1 id="spread-title" className="visually-hidden" ref={titleRef} tabIndex={-1}>
          {recipe ? t('recipe.editing', { name: recipe.name }) : t('recipes.new')}
        </h1>
        <p className="kicker">
          {!recipe
            ? t('recipe.kickerNew')
            : first
              ? t('recipe.kickerFiled', { n: recipe.id, tag: first })
              : t('recipe.kicker', { n: recipe.id })}
        </p>
        <Field label={t('common.name')} hideLabel error={errors.name} className="spread-name">
          {(control) => (
            <input
              {...control}
              ref={nameRef}
              className="annot spread-title-in display"
              autoComplete="off"
              placeholder={t('recipe.namePlaceholder')}
              {...text('name')}
            />
          )}
        </Field>

        <div className="spread-edit-meta">
          <Field label={t('recipe.serves')} hint={t('recipes.servingsHint')} error={errors.servings} className="spread-serves">
            {(control) => (
              <input {...control} className="annot spread-num-in" inputMode="numeric" autoComplete="off" {...text('servings')} />
            )}
          </Field>

          <Fieldset legend={t('recipes.portionSize')} className="spread-portion">
            <Segmented
              label={t('recipe.portionMode')}
              value={draft.inSteps ? 'steps' : 'any'}
              onChange={(mode) => setInSteps(mode === 'steps')}
              options={[
                { value: 'any', label: t('recipes.anyAmount') },
                { value: 'steps', label: t('recipes.inSteps') },
              ]}
              compact
            />
            <div className="spread-portion-row">
              <Multiplier label={t('recipes.from')} error={errors.min} {...text('min')} />
              <Multiplier label={t('recipes.to')} error={errors.max} {...text('max')} />
              {draft.inSteps ? <Multiplier label={t('recipe.stepOf')} error={errors.step} {...text('step')} /> : null}
            </div>
          </Fieldset>

          <Disclosure
            summary={t('recipes.advanced')}
            startOpen={advancedSet || !!errors.hardMax || !!errors.penalty}
            className="spread-advanced"
          >
            <Multiplier
              label={t('recipes.hardMax')}
              hint={defaultHardMax ? t('recipes.hardMaxHint', { max: defaultHardMax }) : t('recipes.hardMaxHintNoMax')}
              placeholder={defaultHardMax}
              error={errors.hardMax}
              {...text('hardMax')}
            />
            <Field label={t('recipes.penalty')} hint={t('recipes.penaltyHint')} error={errors.penalty}>
              {(control) => (
                <input {...control} className="annot spread-num-in" inputMode="decimal" autoComplete="off" {...text('penalty')} />
              )}
            </Field>
          </Disclosure>
        </div>
      </div>

      <section className="spread-sec" aria-labelledby="spread-ingredients">
        <SectionHead id="spread-ingredients" n={1} title={t('recipe.ingredients')} />
        <LineEditor
          sections={draft.sections}
          pending={draft.pending}
          errors={errors}
          ingredients={ingredients}
          edit={edit}
          onIngredientChanged={onIngredientChanged}
          review={review?.line}
        />
        {errors.items ? (
          <p className="field-error" role="alert">
            {errors.items}
          </p>
        ) : null}
      </section>

      <section className="spread-sec" aria-labelledby="spread-method">
        <SectionHead id="spread-method" n={2} title={t('recipe.method')} />
        <Field label={t('recipes.instructions')} hideLabel hint={t('recipe.methodHint')}>
          {(control) => <textarea {...control} className="annot spread-method-in" rows={8} {...text('instructions')} />}
        </Field>
      </section>

      <section className="spread-sec" aria-labelledby="spread-notes">
        <SectionHead id="spread-notes" n={3} title={t('recipe.notes')} />
        <div className="spread-tags">
          <h3 className="kicker" id="spread-tags-title">
            {t('recipe.tags')}
          </h3>
          {tags.length > 0 ? (
            <>
              <TagPicker
                labelledBy="spread-tags-title"
                tags={tags}
                chosen={draft.extraTagIds}
                locked={derived}
                lockedNote={t('recipe.auto')}
                hint={<p className="spread-hint">{t('recipe.tagsHint')}</p>}
                onToggle={toggleTag}
              />
            </>
          ) : (
            <p className="spread-none">{t('ingredients.noTags')}</p>
          )}
        </div>

        {attributes.length > 0 ? (
          <table className="spread-nutri">
            <caption>{t('recipe.perPortion')}</caption>
            <tbody>
              {attributes.map((attribute) => (
                <tr key={attribute.id}>
                  <th scope="row">{attribute.name}</th>
                  <td>{`${totals.get(attribute.id) ?? '0'} ${attribute.unit}`.trim()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="spread-none">{t('ingredients.noAttributes')}</p>
        )}

        <Field label={t('recipe.source')} error={errors.sourceUrl} className="spread-source-field">
          {(control) => (
            <input
              {...control}
              className="annot"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…"
              {...text('sourceUrl')}
            />
          )}
        </Field>
      </section>

      {recipe ? (
        <div className="spread-delete">
          <Button variant="text" onClick={askDelete}>
            {t('recipe.delete')}
          </Button>
          {deleteFailed ? (
            <p className="spread-save-error" role="alert">
              {t('common.deleteFailed')}
            </p>
          ) : null}
        </div>
      ) : null}
      {confirmSheet}
      {review?.sheets}
      {draft.imported ? <LeaveGuard done={done} /> : null}
    </form>
  )
}

/** A portion multiplier, written "2 ×". */
function Multiplier({
  label,
  hint,
  error,
  value,
  placeholder,
  onChange,
}: {
  label: string
  hint?: string
  error: string
  value: string
  placeholder?: string
  onChange: (event: { target: { value: string } }) => void
}) {
  return (
    <Field label={label} hint={hint} error={error} className="spread-multiplier">
      {(control) => (
        <span className="spread-times">
          <input
            {...control}
            className="annot spread-num-in"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={onChange}
          />
          <span aria-hidden="true">×</span>
        </span>
      )}
    </Field>
  )
}

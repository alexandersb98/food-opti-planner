import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../../api/client'
import type { Attribute, Ingredient, Recipe, Tag } from '../../../api/types'
import { loadAll } from '../../../load'
import { useImportedDraft } from '../../hooks/useImportedDraft'
import { useLoad } from '../../hooks/useLoad'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { useRunningHead } from '../../shell/runningHead'
import { toast } from '../../shell/toast'
import { attributesList, ingredientsList, tagsList } from '../../stores/sharedLists'
import { Button, buttonClass } from '../../ui/button/Button'
import { LoadState } from '../../ui/loadState/LoadState'
import { Plate } from '../../ui/plate/Plate'
import { EDITOR_FORM_ID, SpreadEditor } from './SpreadEditor'
import { SpreadView } from './SpreadView'
import { plateNumeral } from './spread'
import './spread.css'

/** What the spread is drawn from: the recipe and the catalogue it names. */
export interface SpreadData {
  recipe: Recipe
  attributes: Attribute[]
  tags: Tag[]
  ingredients: Ingredient[]
}

/**
 * The recipe spread: a recipe as a cookbook page (/recipes/:id), read in
 * view mode, with "Edit" turning it into the annotated page; a new recipe
 * (/recipes/new) opens as a blank spread straight in edit mode.
 */
export function RecipeSpread() {
  const { id } = useParams()
  if (id === undefined) return <NewRecipe />
  return <StoredRecipe key={id} id={Number(id)} />
}

const EDIT_ID = 'spread-edit'

/** The catalogue a recipe names: attributes, tags and ingredients, from
 * the shared lists (downloaded once, then refreshed in the background). */
function catalogue() {
  return {
    attributes: attributesList.loadCall(),
    tags: tagsList.loadCall(),
    ingredients: ingredientsList.loadCall(),
  }
}

/** Keeps an ingredient that gained a conversion, or a new one (the import
 * review's "+ New ingredient"), in the page's catalogue. */
function withIngredient<T extends { ingredients: Ingredient[] }>(ingredient: Ingredient) {
  return (data: T): T => ({
    ...data,
    ingredients: data.ingredients.some((known) => known.id === ingredient.id)
      ? data.ingredients.map((known) => (known.id === ingredient.id ? ingredient : known))
      : [...data.ingredients, ingredient],
  })
}

/** The edit mode's bar: what is going on, Cancel and Save (which submits
 * the editor's form). */
function EditBar({ hint, saving, onCancel }: { hint: string; saving: boolean; onCancel: () => void }) {
  const t = useT()
  return (
    <div className="spread-bar spread-bar-editing">
      <span className="spread-hint-bar">{hint}</span>
      <span className="spread-bar-actions">
        <Button variant="ghost" small onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="accent" small type="submit" form={EDITOR_FORM_ID} disabled={saving}>
          {saving ? t('recipe.saving') : t('common.save')}
        </Button>
      </span>
    </div>
  )
}

function StoredRecipe({ id }: { id: number }) {
  const t = useT()
  const navigate = useNavigate()
  const page = useLoad((signal) =>
    loadAll({
      recipe: api.GET('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } }, signal }),
      ...catalogue(),
    }),
  )
  // The unit catalogue says which line units convert; until it is known the
  // spread shows the server's totals and flags no unit.
  const units = useUnits()
  const ratio = units.units.length > 0 ? units.ratio : null
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const wasEditing = useRef(false)

  useRunningHead(page.data?.recipe.name)

  // Back from edit mode, the focus returns to "Edit" (D2).
  useEffect(() => {
    if (wasEditing.current && !editing) document.getElementById(EDIT_ID)?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  // Leaving the page mid-edit throws the edits away and says so (D2). The
  // message is kept in a ref so the farewell runs only on unmount.
  const leftMessage = useRef('')
  useEffect(() => {
    leftMessage.current = editing ? t('recipe.leftUnsaved') : ''
  }, [editing, t])
  useEffect(
    () => () => {
      if (leftMessage.current) toast(leftMessage.current)
    },
    [],
  )

  const startEditing = useCallback(() => setEditing(true), [])
  const stopEditing = useCallback(() => setEditing(false), [])

  const { setData } = page
  const saved = useCallback(
    (recipe: Recipe) => {
      setData((data) => (data ? { ...data, recipe } : data))
      setEditing(false)
      toast(t('recipe.saved', { name: recipe.name }))
    },
    [setData, t],
  )
  const ingredientChanged = useCallback((ingredient: Ingredient) => setData(withIngredient(ingredient)), [setData])
  const deleted = useCallback(
    (recipe: Recipe) => {
      leftMessage.current = ''
      toast(t('recipe.deleted', { name: recipe.name }))
      void navigate('/recipes')
    },
    [navigate, t],
  )

  const data = page.data
  const ingredients = useMemo(() => new Map(data?.ingredients.map((i) => [i.id, i])), [data])

  if (!data) return <LoadState of={page} message={t('recipes.loadOneFailed')} />
  const { recipe } = data

  return (
    <article className="spread" aria-labelledby="spread-title">
      <figure className="spread-fig">
        <div className="spread-plate">
          <Plate id={recipe.id} label={t('recipe.plateOf', { name: recipe.name })} />
        </div>
        <figcaption className="spread-cap">
          <span className="spread-pn">
            <span aria-hidden="true">{t('recipe.plateNo', { n: plateNumeral(recipe.id) })}</span>
            <span className="visually-hidden">{t('recipe.plateNo', { n: recipe.id })}</span>
          </span>
          <span>{t('recipe.lineCount', recipe.sections.reduce((n, s) => n + s.items.length, 0))}</span>
        </figcaption>
      </figure>

      {editing ? (
        <EditBar hint={t('recipe.annotating')} saving={saving} onCancel={stopEditing} />
      ) : (
        <div className="spread-bar">
          <Link className={buttonClass({ variant: 'text-plain' }, 'spread-back')} to="/recipes">
            {t('recipe.back')}
          </Link>
          <Button id={EDIT_ID} small onClick={startEditing} aria-label={t('recipe.editName', { name: recipe.name })}>
            {t('recipe.edit')}
          </Button>
        </div>
      )}

      {editing ? (
        <SpreadEditor
          recipe={recipe}
          attributes={data.attributes}
          tags={data.tags}
          ingredients={ingredients}
          onSaved={saved}
          onDeleted={deleted}
          onSavingChange={setSaving}
          onIngredientChanged={ingredientChanged}
        />
      ) : (
        <SpreadView data={data} ingredients={ingredients} ratio={ratio} />
      )}
    </article>
  )
}

/** A new recipe: a blank spread, already in edit mode, or an imported
 * recipe to review (left by the import page). Saving opens the stored
 * recipe's spread; Cancel goes back to the index. */
function NewRecipe() {
  const t = useT()
  const navigate = useNavigate()
  // Taken on mounting, before the catalogue loads, so a retry keeps it.
  const imported = useImportedDraft()
  const page = useLoad(() => loadAll(catalogue()))
  const [saving, setSaving] = useState(false)
  useRunningHead(t('recipes.new'))

  const data = page.data
  const ingredients = useMemo(() => new Map(data?.ingredients.map((i) => [i.id, i])), [data])
  const cancel = useCallback(() => void navigate('/recipes'), [navigate])
  const { setData } = page
  const ingredientChanged = useCallback((ingredient: Ingredient) => setData(withIngredient(ingredient)), [setData])
  const saved = useCallback(
    (recipe: Recipe) => {
      toast(t('recipe.saved', { name: recipe.name }))
      void navigate(`/recipes/${recipe.id}`, { replace: true })
    },
    [navigate, t],
  )

  if (!data) return <LoadState of={page} message={t('recipes.loadOneFailed')} />

  return (
    <article className="spread" aria-labelledby="spread-title">
      <figure className="spread-fig">
        {/* a blank plate, drawn once the recipe has a number */}
        <div className="spread-plate spread-plate-blank" />
        <figcaption className="spread-cap">
          <span className="spread-pn">{t('recipe.unnumbered')}</span>
          <span>{t('recipe.lineCount', imported ? imported.sections.reduce((n, s) => n + s.lines.length, 0) : 0)}</span>
        </figcaption>
      </figure>
      <EditBar
        hint={imported ? t('recipe.review.annotating') : t('recipe.annotatingNew')}
        saving={saving}
        onCancel={cancel}
      />
      <SpreadEditor
        recipe={null}
        imported={imported}
        attributes={data.attributes}
        tags={data.tags}
        ingredients={ingredients}
        onSaved={saved}
        onSavingChange={setSaving}
        onIngredientChanged={ingredientChanged}
      />
    </article>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../../api/client'
import type { Attribute, Ingredient, Recipe, Tag } from '../../../api/types'
import { loadAll } from '../../../load'
import { useLoad } from '../../hooks/useLoad'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { useRunningHead } from '../../shell/runningHead'
import { Button, buttonClass } from '../../ui/button/Button'
import { LoadState } from '../../ui/loadState/LoadState'
import { Plate } from '../../ui/plate/Plate'
import { SpreadEditor } from './SpreadEditor'
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
 * view mode, with "Edit" turning it into the annotated page (ticket 27); a
 * new recipe (/recipes/new) opens straight in edit mode.
 */
export function RecipeSpread() {
  const { id } = useParams()
  if (id === undefined) return <SpreadEditor data={null} />
  return <StoredRecipe key={id} id={Number(id)} />
}

const EDIT_ID = 'spread-edit'

function StoredRecipe({ id }: { id: number }) {
  const t = useT()
  const page = useLoad((signal) =>
    loadAll({
      recipe: api.GET('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } }, signal }),
      attributes: api.GET('/api/attributes', { signal }),
      tags: api.GET('/api/tags', { signal }),
      ingredients: api.GET('/api/ingredients', { signal }),
    }),
  )
  // The unit catalogue says which line units convert; until it is known the
  // spread shows the server's totals and flags no unit.
  const units = useUnits()
  const ratio = units.units.length > 0 ? units.ratio : null
  const [editing, setEditing] = useState(false)
  const wasEditing = useRef(false)

  useRunningHead(page.data?.recipe.name)

  // Back from edit mode, the focus returns to "Edit" (D2).
  useEffect(() => {
    if (wasEditing.current && !editing) document.getElementById(EDIT_ID)?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  const startEditing = useCallback(() => setEditing(true), [])
  const stopEditing = useCallback(() => setEditing(false), [])

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

      <div className={editing ? 'spread-bar spread-bar-editing' : 'spread-bar'}>
        {editing ? (
          // Ticket 27: the annotating hint, and Cancel and Save.
          <span className="spread-bar-actions">
            <Button variant="ghost" small onClick={stopEditing}>
              {t('common.cancel')}
            </Button>
          </span>
        ) : (
          <>
            <Link className={buttonClass({ variant: 'text-plain' }, 'spread-back')} to="/recipes">
              {t('recipe.back')}
            </Link>
            <Button id={EDIT_ID} small onClick={startEditing} aria-label={t('recipe.editName', { name: recipe.name })}>
              {t('recipe.edit')}
            </Button>
          </>
        )}
      </div>

      {editing ? (
        <SpreadEditor data={data} />
      ) : (
        <SpreadView data={data} ingredients={ingredients} ratio={ratio} />
      )}
    </article>
  )
}

import { useId, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../../api/client'
import type { Ingredient, RecipeUse } from '../../../api/types'
import { sortByName } from '../../../lists'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'

/** "Used in 2 recipes · Show", the recipes when asked for, and Delete,
 * refused while recipes use the ingredient. */
export function IngredientUse({
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
  const [recipes, setRecipes] = useState<RecipeUse[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const inUse = ingredient.recipe_count > 0

  async function show() {
    setFailed(false)
    setAsking(true)
    try {
      // Only the ids and names of the recipes that use it, not every recipe.
      const { data } = await api.GET('/api/ingredients/{ingredient_id}/recipes', {
        params: { path: { ingredient_id: ingredient.id } },
      })
      if (!data) throw new Error('no recipes')
      setRecipes(sortByName(data))
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

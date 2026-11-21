import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { ImportedRecipe, Recipe, Tag } from '../../../api/types'
import {
  checkRecipe,
  draftOf,
  draftOfImport,
  emptyDraft,
  hasErrors,
  keptLines,
  multiplier,
  noErrors,
  serverErrors,
  type DraftLine,
  type RecipeDraft,
  type RecipeErrors,
} from '../../../recipeDraft'
import { useT } from '../../i18n/i18n'

// The recipe editor's draft in React: the pure rules (`src/recipeDraft.ts`)
// held in a reducer, with the tags the ingredients give, saving and
// deleting. The spread's edit mode (SpreadEditor) uses it; ticket 33's line
// editor changes the sections and lines through `edit`, and ticket 35 opens
// it on an imported draft.

/** The draft's text fields, each with an error of the same name. */
export type TextField = 'name' | 'servings' | 'instructions' | 'sourceUrl' | 'min' | 'max' | 'step' | 'hardMax' | 'penalty'

export type DraftAction =
  | { type: 'set'; field: TextField; value: string }
  | { type: 'inSteps'; value: boolean }
  | { type: 'toggleTag'; tagId: number }
  /** Any other change, as a pure function of the draft (sections and lines,
   * the import review): ticket 33 and 35. */
  | { type: 'edit'; change: (draft: RecipeDraft) => RecipeDraft }

export function draftReducer(draft: RecipeDraft, action: DraftAction): RecipeDraft {
  switch (action.type) {
    case 'set':
      return draft[action.field] === action.value ? draft : { ...draft, [action.field]: action.value }
    case 'inSteps':
      return { ...draft, inSteps: action.value }
    case 'toggleTag': {
      const extraTagIds = new Set(draft.extraTagIds)
      if (!extraTagIds.delete(action.tagId)) extraTagIds.add(action.tagId)
      return { ...draft, extraTagIds }
    }
    case 'edit':
      return action.change(draft)
  }
}

/** Where the draft starts: the stored recipe, an imported one, or blank. */
function startDraft({ recipe, imported }: { recipe: Recipe | null; imported: ImportedRecipe | null }): RecipeDraft {
  if (recipe) return draftOf(recipe, '0.5')
  const blank = emptyDraft()
  return imported ? draftOfImport(imported, blank) : blank
}

const NO_ERRORS: RecipeErrors = { ...noErrors, sectionNames: {}, amounts: {}, unitErrors: {}, lineIngredients: {} }

/** Distinct ingredient ids, sorted and joined: the key the derived-tags
 * question is asked on. */
function idsKey(ids: Array<number | null>): string {
  return [...new Set(ids.filter((id): id is number => id !== null))].sort((a, b) => a - b).join(',')
}

export interface RecipeDraftOptions {
  /** The stored recipe; null for a new one. */
  recipe: Recipe | null
  /** An imported recipe to review (new recipes only; ticket 35). */
  imported?: ImportedRecipe | null
}

/**
 * A recipe's draft for the spread's edit mode: the fields as typed, what is
 * wrong with them, the tags the ingredients give (asked of the server, which
 * knows each tag's rule, whenever the ingredients change), and saving or
 * deleting the recipe. `save` resolves with the stored recipe, or null after
 * marking what is wrong; `remove` with whether it deleted.
 */
export function useRecipeDraft({ recipe, imported = null }: RecipeDraftOptions) {
  const t = useT()
  const [draft, dispatch] = useReducer(draftReducer, { recipe, imported }, startDraft)
  const [errors, setErrors] = useState<RecipeErrors>(NO_ERRORS)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  // Counts the checks that marked a field, so the page can move the focus
  // to the first marked field after each.
  const [marked, setMarked] = useState(0)

  // The tags from the ingredients: the stored recipe's come with it; asked
  // again whenever the set of ingredients changes, the latest answer winning.
  const storedIds = useMemo(
    () => idsKey(recipe?.sections.flatMap((s) => s.items.map((i) => i.ingredient_id)) ?? []),
    [recipe],
  )
  const ids = idsKey(keptLines(draft).map((line) => line.ingredientId))
  const [asked, setAsked] = useState<{ ids: string; tagIds: number[] }>({ ids: '', tagIds: [] })
  useEffect(() => {
    if (ids === '' || ids === storedIds) return
    const controller = new AbortController()
    api
      .POST('/api/recipes/derived-tags', { body: { ingredient_ids: ids.split(',').map(Number) }, signal: controller.signal })
      .then(({ data }) => setAsked({ ids, tagIds: data ?? [] }))
      .catch(() => {
        if (!controller.signal.aborted) setAsked({ ids, tagIds: [] })
      })
    return () => controller.abort()
  }, [ids, storedIds])
  const derivedTagIds = useMemo(
    () =>
      ids === ''
        ? []
        : ids === storedIds
          ? (recipe?.derived_tag_ids ?? [])
          : asked.ids === ids
            ? asked.tagIds
            : [],
    [ids, storedIds, recipe, asked],
  )

  /** A text field as typed; its error goes until the next save. */
  const set = useCallback((field: TextField, value: string) => {
    dispatch({ type: 'set', field, value })
    if (field !== 'instructions') setErrors((e) => (e[field] ? { ...e, [field]: '' } : e))
  }, [])

  const setInSteps = useCallback((value: boolean) => {
    dispatch({ type: 'inSteps', value })
    setErrors((e) => (e.step ? { ...e, step: '' } : e))
  }, [])

  const toggleTag = useCallback((tagId: number) => dispatch({ type: 'toggleTag', tagId }), [])

  /** The hard upper limit when none is typed: 3 times To, as text ('' while
   * To isn't a number). */
  const max = multiplier(draft.max)
  const defaultHardMax = max === null ? '' : String((3 * max) / 1000)

  /** Send the draft unless a field is wrong. `tags` are the tags there are;
   * `converts` says whether a line's unit converts to its ingredient's. */
  async function save(tags: Tag[], converts?: (line: DraftLine) => boolean): Promise<Recipe | null> {
    if (busy.current) return null
    const { fields, errors: wrong } = checkRecipe(draft, tags, t, converts)
    setErrors(wrong)
    if (hasErrors(wrong)) {
      setMarked((n) => n + 1)
      return null
    }
    busy.current = true
    setSaving(true)
    try {
      const { data: saved, error } = recipe
        ? await api.PUT('/api/recipes/{recipe_id}', { params: { path: { recipe_id: recipe.id } }, body: fields })
        : await api.POST('/api/recipes', { body: fields })
      if (saved) return saved
      const shown = serverErrors(fieldErrors(error), draft, t)
      if (shown) {
        setErrors({ ...wrong, ...shown })
        setMarked((n) => n + 1)
      } else setErrors({ ...wrong, save: t('common.saveFailed') })
    } catch {
      setErrors({ ...wrong, save: t('common.saveFailed') })
    } finally {
      busy.current = false
      setSaving(false)
    }
    return null
  }

  /** Delete the stored recipe: whether it did. */
  async function remove(): Promise<boolean> {
    if (!recipe) return false
    try {
      const { response } = await api.DELETE('/api/recipes/{recipe_id}', { params: { path: { recipe_id: recipe.id } } })
      return response.ok
    } catch {
      return false
    }
  }

  return { draft, dispatch, errors, saving, marked, derivedTagIds, defaultHardMax, set, setInSteps, toggleTag, save, remove }
}

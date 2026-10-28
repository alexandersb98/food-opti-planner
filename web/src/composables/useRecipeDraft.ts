import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Ingredient, Recipe, RecipeFields as Fields, Tag } from '../api/types'
import type { Translate } from '../goals'
import { typedNumber } from '../numbers'

// The recipe editor's draft: the fields as typed, how they are checked before
// sending, the server's refusals on their fields, and saving or deleting the
// recipe. The pure parts are exported apart, so they can be tested without
// the page.

/** The fields as typed. Amounts are per portion, in each ingredient's unit. */
export type RecipeDraft = {
  name: string
  items: { ingredientId: number; amount: string }[]
  extraTagIds: Set<number>
  min: string
  max: string
  inSteps: boolean
  step: string
  hardMax: string // empty: 3 times max, the library's default
  penalty: string
}

const noErrors = {
  name: '',
  items: '',
  amounts: {} as Partial<Record<number, string>>, // by ingredient id
  min: '',
  max: '',
  step: '',
  hardMax: '',
  penalty: '',
  save: '',
}

/** What the editor marks wrong, by field; '' for nothing. */
export type RecipeErrors = typeof noErrors

/** A new recipe's draft. */
export function emptyDraft(): RecipeDraft {
  return {
    name: '',
    items: [],
    extraTagIds: new Set(),
    min: '0.5',
    max: '2',
    inSteps: false,
    step: '0.5',
    hardMax: '',
    penalty: '1',
  }
}

/** A stored recipe as typed; a recipe without a step keeps `step` as it was. */
export function draftOf(recipe: Recipe, step: string): RecipeDraft {
  return {
    name: recipe.name,
    items: recipe.items.map(({ ingredient_id, amount }) => ({ ingredientId: ingredient_id, amount })),
    extraTagIds: new Set(recipe.extra_tag_ids),
    min: recipe.min_multiplier,
    max: recipe.max_multiplier,
    inSteps: recipe.step !== null,
    step: recipe.step ?? step,
    hardMax: recipe.hard_max_multiplier ?? '',
    penalty: recipe.serving_cap_weight,
  }
}

/** A multiplier as typed, in whole thousandths as the planner holds it
 * (0.5 is 500), or null unless it is above 0 with at most 3 decimals and
 * 9 digits before the point. */
export function multiplier(text: string): number | null {
  const number = typedNumber(text)
  if (number === null || !/^\d{1,9}(\.\d{0,3})?$|^\.\d{1,3}$/.test(number)) return null
  const thousandths = Math.round(Number(number) * 1000)
  return thousandths > 0 ? thousandths : null
}

/** Whether any field is wrong; `save` is not a field. */
export function hasErrors(errors: RecipeErrors): boolean {
  return !!(
    errors.name ||
    errors.items ||
    Object.keys(errors.amounts).length > 0 ||
    errors.min ||
    errors.max ||
    errors.step ||
    errors.hardMax ||
    errors.penalty
  )
}

/** The fields to send, and what is wrong with each as typed. `tags` are the
 * tags there are; a hand-added tag no longer among them is left out. */
export function checkRecipe(draft: RecipeDraft, tags: Tag[], t: Translate): { fields: Fields; errors: RecipeErrors } {
  const fields: Fields = {
    name: draft.name.trim(),
    items: [],
    extra_tag_ids: tags.filter((tag) => draft.extraTagIds.has(tag.id)).map((tag) => tag.id),
    min_multiplier: typedNumber(draft.min) ?? '',
    max_multiplier: typedNumber(draft.max) ?? '',
    step: draft.inSteps ? (typedNumber(draft.step) ?? '') : null,
    hard_max_multiplier: draft.hardMax.trim() === '' ? null : (typedNumber(draft.hardMax) ?? ''),
    serving_cap_weight: typedNumber(draft.penalty) ?? '',
  }
  const errors: RecipeErrors = {
    ...noErrors,
    name: fields.name ? '' : t('common.nameRequired', {}),
    items: draft.items.length > 0 ? '' : t('recipes.noItems', {}),
    amounts: {},
  }
  for (const { ingredientId, amount } of draft.items) {
    const number = typedNumber(amount)
    if (number === null || Number(number) <= 0) errors.amounts[ingredientId] = t('recipes.amountInvalid', {})
    else fields.items.push({ ingredient_id: ingredientId, amount: number })
  }

  const [min, max, step] = [multiplier(draft.min), multiplier(draft.max), multiplier(draft.step)]
  const noHardMax = fields.hard_max_multiplier === null
  const hardMax = noHardMax ? null : multiplier(draft.hardMax)
  const invalid = t('recipes.multiplierInvalid', {})
  errors.min = min === null ? invalid : ''
  errors.max = max === null ? invalid : ''
  errors.step = draft.inSteps && step === null ? invalid : ''
  errors.hardMax = !noHardMax && hardMax === null ? invalid : ''
  // The library's rules across fields, which the server checks too.
  if (min !== null && max !== null && max < min) errors.max = t('recipes.belowMin', {})
  if (max !== null && hardMax !== null && hardMax < max) errors.hardMax = t('recipes.belowMax', {})
  if (draft.inSteps && min !== null && step !== null && min % step !== 0) errors.min = t('recipes.notInSteps', {})
  const penalty = typedNumber(draft.penalty)
  errors.penalty = penalty !== null && Number(penalty) >= 0 ? '' : t('recipes.penaltyInvalid', {})
  return { fields, errors }
}

/** The server's refusal of `fields` on the fields it names: a name in use,
 * or a number the server can't take. Null when it names none of them, so
 * the save just failed. */
export function serverErrors(
  byField: Partial<Record<string, string>>,
  fields: Fields,
  t: Translate,
): Partial<RecipeErrors> | null {
  const messages: Partial<Record<string, string>> = {
    below_min: t('recipes.belowMin', {}),
    below_max: t('recipes.belowMax', {}),
    not_in_steps: t('recipes.notInSteps', {}),
  }
  const errors: Partial<RecipeErrors> = {}
  const amounts: Partial<Record<number, string>> = {}
  function message(field: string, otherwise: string) {
    const type = byField[field]
    return type ? (messages[type] ?? otherwise) : undefined
  }
  if (byField.name === 'name_in_use') errors.name = t('recipes.nameInUse', {})
  const tooLong = t('recipes.multiplierTooLong', {})
  const numberTooLong = t('ingredients.numberTooLong', {})
  const numbers = [
    ['min', 'min_multiplier', tooLong],
    ['max', 'max_multiplier', tooLong],
    ['step', 'step', tooLong],
    ['hardMax', 'hard_max_multiplier', tooLong],
    ['penalty', 'serving_cap_weight', numberTooLong],
  ] as const
  for (const [key, field, otherwise] of numbers) {
    const text = message(field, otherwise)
    if (text) errors[key] = text
  }
  fields.items.forEach(({ ingredient_id }, i) => {
    const text = message(`items.${i}.amount`, numberTooLong)
    if (text) amounts[ingredient_id] = text
  })
  if (Object.keys(amounts).length > 0) errors.amounts = amounts
  return Object.keys(errors).length > 0 ? errors : null
}

/** A recipe's draft for the editor of recipe `id` (null for a new one):
 * the fields as typed, what is wrong with them, the tags the ingredients
 * give it, and saving or deleting it. `remove` says whether it deleted;
 * when a save or delete fails, `errors` says why. */
export function useRecipeDraft(id: number | null) {
  const { t } = useI18n()

  const draft = reactive(emptyDraft())
  const errors = reactive<RecipeErrors>({ ...noErrors, amounts: {} })
  const saving = ref(false)
  // Open when it holds something other than the defaults, or a mistake.
  const advancedOpen = ref(false)
  // The tags the ingredients give the recipe, asked of the server, which
  // knows each tag's rule.
  const derivedTagIds = ref<number[]>([])
  // The stored recipe's ingredient ids, joined, and the tags they give it.
  let stored = { ids: '', tagIds: [] as number[] }

  /** Fill the draft from the stored recipe. */
  function fillDraft(recipe: Recipe) {
    Object.assign(draft, draftOf(recipe, draft.step))
    advancedOpen.value = draft.hardMax !== '' || draft.penalty !== '1'
    stored = { ids: recipe.items.map((item) => item.ingredient_id).join(','), tagIds: recipe.derived_tag_ids }
    derivedTagIds.value = recipe.derived_tag_ids
  }

  function addIngredient(ingredient: Ingredient) {
    draft.items.push({ ingredientId: ingredient.id, amount: '' })
    errors.items = ''
  }

  function removeIngredient(index: number) {
    draft.items.splice(index, 1)
  }

  // Asked again whenever the ingredients change; an answer to an older
  // question is dropped. The stored recipe's ingredients come with their tags.
  let asked = 0
  watch(
    () => draft.items.map((item) => item.ingredientId).join(','),
    async (ids) => {
      const question = ++asked
      if (ids === stored.ids || ids === '') {
        derivedTagIds.value = ids === '' ? [] : stored.tagIds
        return
      }
      const ingredientIds = ids.split(',').map(Number)
      try {
        const { data: tagIds } = await api.POST('/api/recipes/derived-tags', {
          body: { ingredient_ids: ingredientIds },
        })
        if (question === asked) derivedTagIds.value = tagIds ?? []
      } catch {
        if (question === asked) derivedTagIds.value = []
      }
    },
  )

  function hasTag(tag: Tag) {
    return draft.extraTagIds.has(tag.id) || derivedTagIds.value.includes(tag.id)
  }

  /** A tag added by hand, on or off; the ingredients' tags stay on. */
  function toggleTag(tag: Tag) {
    const tagIds = new Set(draft.extraTagIds)
    if (tagIds.has(tag.id)) tagIds.delete(tag.id)
    else tagIds.add(tag.id)
    draft.extraTagIds = tagIds
  }

  /** The hard upper limit when none is typed: 3 times the largest portion. */
  const defaultHardMax = computed(() => {
    const max = multiplier(draft.max)
    return max === null ? '' : String((3 * max) / 1000)
  })

  /** Mark what is wrong; the advanced fields open when they hold a mistake. */
  function showErrors(shown: Partial<RecipeErrors>) {
    Object.assign(errors, shown)
    if (errors.hardMax || errors.penalty) advancedOpen.value = true
  }

  /** Send the draft, unless a field is wrong, then `done` (such as leaving
   * the page) while `saving` stays on. `tags` are the tags there are. */
  async function save(tags: Tag[], done: () => Promise<unknown>) {
    errors.save = ''
    const { fields, errors: wrong } = checkRecipe(draft, tags, t)
    showErrors(wrong)
    if (hasErrors(wrong)) return
    saving.value = true
    try {
      const { data: saved, error } =
        id === null
          ? await api.POST('/api/recipes', { body: fields })
          : await api.PUT('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } }, body: fields })
      if (saved) {
        await done()
        return
      }
      const shown = serverErrors(fieldErrors(error), fields, t)
      if (shown) showErrors(shown)
      else errors.save = t('common.saveFailed', {})
    } catch {
      errors.save = t('common.saveFailed', {})
    } finally {
      saving.value = false
    }
  }

  /** Delete the stored recipe. */
  async function remove(): Promise<boolean> {
    if (id === null) return false
    errors.save = ''
    try {
      const { response } = await api.DELETE('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } } })
      if (response.ok) return true
    } catch {
      // fails as a refusal does
    }
    errors.save = t('common.deleteFailed', {})
    return false
  }

  return {
    draft,
    errors,
    saving,
    advancedOpen,
    derivedTagIds,
    defaultHardMax,
    fillDraft,
    addIngredient,
    removeIngredient,
    hasTag,
    toggleTag,
    save,
    remove,
  }
}

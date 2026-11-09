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

/** A line of a section. `key` identifies it in the editor (the same
 * ingredient may be on several lines); `originalText` is the imported line,
 * kept so a save does not lose it. */
export type DraftLine = { key: number; ingredientId: number; amount: string; originalText: string }

/** A part of the recipe under a heading; `name` is empty for an unnamed one. */
export type DraftSection = { key: number; name: string; items: DraftLine[] }

/** The fields as typed. Amounts are for the whole recipe, in each
 * ingredient's unit; `servings` is how many portions it makes. */
export type RecipeDraft = {
  name: string
  servings: string
  sections: DraftSection[]
  instructions: string
  sourceUrl: string
  extraTagIds: Set<number>
  min: string
  max: string
  inSteps: boolean
  step: string
  hardMax: string // empty: 3 times max, the library's default
  penalty: string
}

let lastKey = 0
/** A number no other line or section of the page has. */
function newKey(): number {
  return ++lastKey
}

const noErrors = {
  name: '',
  servings: '',
  items: '', // no line anywhere
  sectionNames: {} as Partial<Record<number, string>>, // by section key
  amounts: {} as Partial<Record<number, string>>, // by line key
  sourceUrl: '',
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
    servings: '1',
    sections: [{ key: newKey(), name: '', items: [] }],
    instructions: '',
    sourceUrl: '',
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
    servings: String(recipe.servings),
    sections: recipe.sections.map(({ name, items }) => ({
      key: newKey(),
      name,
      items: items.map(({ ingredient_id, amount, original_text }) => ({
        key: newKey(),
        ingredientId: ingredient_id,
        amount,
        originalText: original_text,
      })),
    })),
    instructions: recipe.instructions,
    sourceUrl: recipe.source_url,
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
    errors.servings ||
    errors.items ||
    errors.sourceUrl ||
    Object.keys(errors.sectionNames).length > 0 ||
    Object.keys(errors.amounts).length > 0 ||
    errors.min ||
    errors.max ||
    errors.step ||
    errors.hardMax ||
    errors.penalty
  )
}

export const MAX_SERVINGS = 1000

/** The servings as typed, if a whole number from 1 to 1000. */
function servingsOf(text: string): number | null {
  const typed = text.trim()
  if (!/^\d{1,4}$/.test(typed)) return null
  const servings = Number(typed)
  return servings >= 1 && servings <= MAX_SERVINGS ? servings : null
}

/** Every line of the recipe in order. */
function linesOf(draft: RecipeDraft): DraftLine[] {
  return draft.sections.flatMap((section) => section.items)
}

/** The fields to send, and what is wrong with each as typed. `tags` are the
 * tags there are; a hand-added tag no longer among them is left out. */
export function checkRecipe(draft: RecipeDraft, tags: Tag[], t: Translate): { fields: Fields; errors: RecipeErrors } {
  const servings = servingsOf(draft.servings)
  const fields: Fields = {
    name: draft.name.trim(),
    servings: servings ?? 0,
    sections: [],
    instructions: draft.instructions,
    source_url: draft.sourceUrl.trim(),
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
    servings: servings === null ? t('recipes.servingsInvalid', {}) : '',
    items: linesOf(draft).length > 0 ? '' : t('recipes.noItems', {}),
    sourceUrl: fields.source_url === '' || /^https?:\/\/\S+$/.test(fields.source_url) ? '' : t('recipes.sourceInvalid', {}),
    sectionNames: {},
    amounts: {},
  }
  for (const section of draft.sections) {
    const name = section.name.trim()
    if (draft.sections.length > 1 && name === '') errors.sectionNames[section.key] = t('recipes.sectionNameRequired', {})
    const items: Fields['sections'][number]['items'] = []
    for (const { key, ingredientId, amount, originalText } of section.items) {
      const number = typedNumber(amount)
      if (number === null || Number(number) <= 0) errors.amounts[key] = t('recipes.amountInvalid', {})
      else items.push({ ingredient_id: ingredientId, amount: number, original_text: originalText })
    }
    fields.sections.push({ name, items })
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

/** The server's refusal of the draft (as `checkRecipe` sent it, so the
 * places in its answer are the draft's) on the fields it names: a name in
 * use, a number or link the server can't take, a section without a name.
 * Null when it names none of them, so the save just failed. */
export function serverErrors(
  byField: Partial<Record<string, string>>,
  draft: RecipeDraft,
  t: Translate,
): Partial<RecipeErrors> | null {
  const messages: Partial<Record<string, string>> = {
    below_min: t('recipes.belowMin', {}),
    below_max: t('recipes.belowMax', {}),
    not_in_steps: t('recipes.notInSteps', {}),
  }
  const errors: Partial<RecipeErrors> = {}
  function message(field: string, otherwise: string) {
    const type = byField[field]
    return type ? (messages[type] ?? otherwise) : undefined
  }
  if (byField.name === 'name_in_use') errors.name = t('recipes.nameInUse', {})
  if (byField.servings) errors.servings = t('recipes.servingsInvalid', {})
  if (byField.source_url) errors.sourceUrl = t('recipes.sourceInvalid', {})
  if (byField.sections === 'no_items') errors.items = t('recipes.noItems', {})
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
  const sectionNames: Partial<Record<number, string>> = {}
  const amounts: Partial<Record<number, string>> = {}
  draft.sections.forEach((section, i) => {
    if (byField[`sections.${i}.name`]) sectionNames[section.key] = t('recipes.sectionNameRequired', {})
    section.items.forEach((line, j) => {
      const text = message(`sections.${i}.items.${j}.amount`, numberTooLong)
      if (text) amounts[line.key] = text
      if (byField[`sections.${i}.items.${j}.ingredient_id`]) errors.save = t('recipes.unknownIngredient', {})
    })
  })
  if (Object.keys(sectionNames).length > 0) errors.sectionNames = sectionNames
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
  const errors = reactive<RecipeErrors>({ ...noErrors, sectionNames: {}, amounts: {} })
  const saving = ref(false)
  // Open when it holds something other than the defaults, or a mistake.
  const advancedOpen = ref(false)
  // The tags the ingredients give the recipe, asked of the server, which
  // knows each tag's rule.
  const derivedTagIds = ref<number[]>([])
  // The stored recipe's distinct ingredient ids, sorted and joined, and the
  // tags they give it.
  let stored = { ids: '', tagIds: [] as number[] }

  /** Ingredient ids, distinct, sorted and joined: the key the question to
   * the server is asked on. */
  function idsKey(ids: number[]): string {
    return [...new Set(ids)].sort((a, b) => a - b).join(',')
  }

  /** Fill the draft from the stored recipe. */
  function fillDraft(recipe: Recipe) {
    Object.assign(draft, draftOf(recipe, draft.step))
    advancedOpen.value = draft.hardMax !== '' || draft.penalty !== '1'
    stored = {
      ids: idsKey(recipe.sections.flatMap((section) => section.items.map((item) => item.ingredient_id))),
      tagIds: recipe.derived_tag_ids,
    }
    derivedTagIds.value = recipe.derived_tag_ids
  }

  function addIngredient(sectionIndex: number, ingredient: Ingredient) {
    draft.sections[sectionIndex]?.items.push({ key: newKey(), ingredientId: ingredient.id, amount: '', originalText: '' })
    errors.items = ''
  }

  function removeLine(sectionIndex: number, lineIndex: number) {
    draft.sections[sectionIndex]?.items.splice(lineIndex, 1)
  }

  /** Move a line to the end of another section. */
  function moveLine(from: number, lineIndex: number, to: number) {
    const target = draft.sections[to]
    const [line] = draft.sections[from]?.items.splice(lineIndex, 1) ?? []
    if (line && target) target.items.push(line)
  }

  function addSection() {
    draft.sections.push({ key: newKey(), name: '', items: [] })
  }

  /** Delete a section's heading; its lines go to the section above (below,
   * for the first one), so none is lost. */
  function removeSection(index: number) {
    const section = draft.sections[index]
    if (!section || draft.sections.length < 2) return
    if (index > 0) draft.sections[index - 1]!.items.push(...section.items)
    else draft.sections[1]!.items.unshift(...section.items)
    draft.sections.splice(index, 1)
  }

  /** The servings as typed when valid, else 1. */
  const servingsNumber = computed(() => servingsOf(draft.servings) ?? 1)
  const lineCount = computed(() => linesOf(draft).length)

  // Asked again whenever the ingredients change; an answer to an older
  // question is dropped. The stored recipe's ingredients come with their tags.
  let asked = 0
  watch(
    () => idsKey(linesOf(draft).map((line) => line.ingredientId)),
    async (ids) => {
      const question = ++asked
      if (ids === stored.ids || ids === '') {
        derivedTagIds.value = ids === '' ? [] : stored.tagIds
        return
      }
      const asking = ids.split(',').map(Number)
      try {
        const { data: tagIds } = await api.POST('/api/recipes/derived-tags', {
          body: { ingredient_ids: asking },
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
      const shown = serverErrors(fieldErrors(error), draft, t)
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
    servingsNumber,
    lineCount,
    fillDraft,
    addIngredient,
    removeLine,
    moveLine,
    addSection,
    removeSection,
    hasTag,
    toggleTag,
    save,
    remove,
  }
}

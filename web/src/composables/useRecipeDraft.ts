import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { ImportedRecipe, Ingredient, Recipe, Tag } from '../api/types'
import { factorSource, pendingKey } from '../importReview'
import { typedNumber } from '../numbers'
import {
  checkRecipe,
  draftOf,
  draftOfImport,
  emptyDraft,
  hasErrors,
  keptLines,
  linesOf,
  multiplier,
  newKey,
  noErrors,
  plainLine,
  serverErrors,
  servingsOf,
  type DraftLine,
  type RecipeErrors,
} from '../recipeDraft'

// The recipe editor's draft in Vue: the rules (`../recipeDraft`) held in
// reactive state, with saving or deleting the recipe.

/** A recipe's draft for the editor of recipe `id` (null for a new one):
 * the fields as typed, what is wrong with them, the tags the ingredients
 * give it, and saving or deleting it. `remove` says whether it deleted;
 * when a save or delete fails, `errors` says why. */
export function useRecipeDraft(id: number | null) {
  const { t } = useI18n()

  const draft = reactive(emptyDraft())
  const errors = reactive<RecipeErrors>({ ...noErrors, sectionNames: {}, amounts: {}, unitErrors: {}, lineIngredients: {} })
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

  /** Fill the draft from an imported recipe, to review. */
  function fillImported(recipe: ImportedRecipe) {
    Object.assign(draft, draftOfImport(recipe, draft))
    advancedOpen.value = false
    stored = { ids: '', tagIds: [] }
  }

  function addIngredient(sectionIndex: number, ingredient: Ingredient) {
    draft.sections[sectionIndex]?.items.push(plainLine(ingredient.id, '', '', ''))
    errors.items = ''
  }

  function lineAt(sectionIndex: number, lineIndex: number): DraftLine | undefined {
    return draft.sections[sectionIndex]?.items[lineIndex]
  }

  /** Match an imported line with an ingredient; its amount and unit stay. */
  function setLineIngredient(sectionIndex: number, lineIndex: number, ingredient: Ingredient) {
    const line = lineAt(sectionIndex, lineIndex)
    if (!line) return
    line.ingredientId = ingredient.id
    // a number the AI gave was for the text's own ingredient and unit
    line.suggestedFactor = null
    line.suggestedUnit = undefined
    delete errors.lineIngredients[line.key]
  }

  function skipLine(sectionIndex: number, lineIndex: number) {
    const line = lineAt(sectionIndex, lineIndex)
    if (line) line.skipped = true
  }

  function unskipLine(sectionIndex: number, lineIndex: number) {
    const line = lineAt(sectionIndex, lineIndex)
    if (line) line.skipped = false
  }

  /** Accept a factor for an ingredient and unit: "1 `unit` = `text` of its
   * own unit", saved with the recipe; replaces an earlier one for the pair. */
  function acceptFactor(ingredientId: number, unit: string, text: string, suggested: string | null) {
    const factor = typedNumber(text)
    if (factor === null) return
    forgetFactor(ingredientId, unit)
    draft.pending.push({ ingredientId, unit, factor, source: factorSource(text, suggested) })
  }

  function forgetFactor(ingredientId: number, unit: string) {
    const key = pendingKey(ingredientId, unit)
    draft.pending = draft.pending.filter((p) => pendingKey(p.ingredientId, p.unit) !== key)
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
    () =>
      idsKey(
        keptLines(draft).flatMap((line) => (line.ingredientId === null ? [] : [line.ingredientId])),
      ),
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
   * the page) while `saving` stays on. `tags` are the tags there are;
   * `converts` says whether a line's unit converts (`checkRecipe`). */
  async function save(tags: Tag[], done: () => Promise<unknown>, converts?: (line: DraftLine) => boolean) {
    errors.save = ''
    const { fields, errors: wrong } = checkRecipe(draft, tags, t, converts)
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
    fillImported,
    addIngredient,
    setLineIngredient,
    skipLine,
    unskipLine,
    acceptFactor,
    forgetFactor,
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

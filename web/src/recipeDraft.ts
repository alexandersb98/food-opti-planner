import type { ImportedRecipe, Recipe, RecipeFields as Fields, Tag } from './api/types'
import type { Translate } from './goals'
import { pendingKey, siteName, type PendingConversion } from './importReview'
import { typedNumber } from './numbers'

// The recipe editor's draft rules: the fields as typed, how they are checked
// before sending and the server's refusals on their fields. Framework-neutral:
// the React hook (`app/pages/recipe/useRecipeDraft`) wraps them.

/** A line of a section. `key` identifies it in the editor (the same
 * ingredient may be on several lines); `unit` is the unit the amount is in,
 * empty for the ingredient's own; `originalText` is the imported line, kept so
 * a save does not lose it. */
export type DraftLine = {
  key: number
  ingredientId: number | null // null only on an imported line not matched yet
  amount: string
  unit: string
  originalText: string
  // Import review only (empty and false on a recipe typed by hand): the
  // food as the text names it, whether the line is left out of the save, whether
  // it was not an ingredient to begin with, and the AI's factor for its unit.
  food: string
  skipped: boolean
  notAnIngredient: boolean
  suggestedFactor: string | null
  suggestedUnit?: string // the unit the suggestion is for (the one imported)
}

/** A part of the recipe under a heading; `name` is empty for an unnamed one. */
export type DraftSection = { key: number; name: string; items: DraftLine[] }

/** The fields as typed. Amounts are for the whole recipe, each in its line's
 * unit; `servings` is how many portions it makes. */
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
  // An imported recipe under review (null for any other): whether the text
  // was cut, the site it came from (empty for pasted text), and the
  // conversions the user accepted, created with the recipe.
  imported: { cut: boolean; site: string } | null
  pending: PendingConversion[]
}

let lastKey = 0
/** A number no other line or section of the page has. */
export function newKey(): number {
  return ++lastKey
}

export const noErrors = {
  name: '',
  servings: '',
  items: '', // no line anywhere
  sectionNames: {} as Partial<Record<number, string>>, // by section key
  amounts: {} as Partial<Record<number, string>>, // by line key
  unitErrors: {} as Partial<Record<number, true>>, // by line key: a unit that doesn't convert
  lineIngredients: {} as Partial<Record<number, string>>, // by line key: no ingredient picked yet
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
    imported: null,
    pending: [],
  }
}

/** A line as typed or stored: no review state. */
export function plainLine(ingredientId: number, amount: string, unit: string, originalText: string): DraftLine {
  return { key: newKey(), ingredientId, amount, unit, originalText, food: '', skipped: false, notAnIngredient: false, suggestedFactor: null }
}

/** A stored recipe as typed; a recipe without a step keeps `step` as it was. */
export function draftOf(recipe: Recipe, step: string): RecipeDraft {
  return {
    name: recipe.name,
    servings: String(recipe.servings),
    sections: recipe.sections.map(({ name, items }) => ({
      key: newKey(),
      name,
      items: items.map(({ ingredient_id, amount, unit, original_text }) =>
        plainLine(ingredient_id, amount, unit, original_text),
      ),
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
    imported: null,
    pending: [],
  }
}

/** An imported recipe as typed, to review: lines the AI called not an
 * ingredient start skipped; a line with no amount starts with an empty box. */
export function draftOfImport(recipe: ImportedRecipe, base: RecipeDraft): RecipeDraft {
  return {
    ...base,
    name: recipe.name,
    servings: String(recipe.servings),
    instructions: recipe.instructions,
    sourceUrl: recipe.source_url,
    sections: recipe.sections.map(({ name, lines }) => ({
      key: newKey(),
      name,
      items: lines.map((line) => ({
        key: newKey(),
        ingredientId: line.ingredient_id,
        amount: line.amount ?? '',
        unit: line.unit,
        originalText: line.original_text,
        food: line.food,
        skipped: line.status === 'not_an_ingredient',
        notAnIngredient: line.status === 'not_an_ingredient',
        suggestedFactor: line.suggested_factor,
        suggestedUnit: line.unit,
      })),
    })),
    imported: { cut: recipe.cut, site: siteName(recipe.source_url) },
    pending: [],
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
    Object.keys(errors.unitErrors).length > 0 ||
    Object.keys(errors.lineIngredients).length > 0 ||
    errors.min ||
    errors.max ||
    errors.step ||
    errors.hardMax ||
    errors.penalty
  )
}

export const MAX_SERVINGS = 1000

/** The servings as typed, if a whole number from 1 to 1000. */
export function servingsOf(text: string): number | null {
  const typed = text.trim()
  if (!/^\d{1,4}$/.test(typed)) return null
  const servings = Number(typed)
  return servings >= 1 && servings <= MAX_SERVINGS ? servings : null
}

/** Every line of the recipe in order. */
export function linesOf(draft: RecipeDraft): DraftLine[] {
  return draft.sections.flatMap((section) => section.items)
}

/** The lines a save sends: the ones not skipped. */
export function keptLines(draft: RecipeDraft): DraftLine[] {
  return linesOf(draft).filter((line) => !line.skipped)
}

/** The fields to send, and what is wrong with each as typed. `tags` are the
 * tags there are; a hand-added tag no longer among them is left out.
 * `converts` says whether a line's unit converts to its ingredient's (the
 * server refuses the save otherwise); it defaults to yes. */
export function checkRecipe(
  draft: RecipeDraft,
  tags: Tag[],
  t: Translate,
  converts: (line: DraftLine) => boolean = () => true,
): { fields: Fields; errors: RecipeErrors } {
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
    // Only the conversions a kept line still uses.
    new_conversions: draft.pending
      .filter((p) =>
        keptLines(draft).some(
          (line) => line.ingredientId !== null && pendingKey(line.ingredientId, line.unit) === pendingKey(p.ingredientId, p.unit),
        ),
      )
      .map((p) => ({ ingredient_id: p.ingredientId, unit: p.unit, factor: p.factor, source: p.source })),
  }
  const errors: RecipeErrors = {
    ...noErrors,
    name: fields.name ? '' : t('common.nameRequired', {}),
    servings: servings === null ? t('recipes.servingsInvalid', {}) : '',
    items: keptLines(draft).length > 0 ? '' : t('recipes.noItems', {}),
    sourceUrl: fields.source_url === '' || /^https?:\/\/\S+$/.test(fields.source_url) ? '' : t('recipes.sourceInvalid', {}),
    sectionNames: {},
    amounts: {},
    unitErrors: {},
    lineIngredients: {},
  }
  for (const section of draft.sections) {
    const name = section.name.trim()
    if (draft.sections.length > 1 && name === '') errors.sectionNames[section.key] = t('recipes.sectionNameRequired', {})
    const items: Fields['sections'][number]['items'] = []
    for (const line of section.items) {
      if (line.skipped) continue
      const { key, ingredientId, amount, unit, originalText } = line
      const number = typedNumber(amount)
      if (ingredientId === null) {
        errors.lineIngredients[key] = t('recipes.pickIngredient', {})
        continue
      }
      if (number === null || Number(number) <= 0) errors.amounts[key] = t('recipes.amountInvalid', {})
      else items.push({ ingredient_id: ingredientId, amount: number, unit: unit.trim(), original_text: originalText })
      if (!converts(line)) errors.unitErrors[key] = true
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
  const unitErrors: Partial<Record<number, true>> = {}
  if (Object.keys(byField).some((field) => field.startsWith('new_conversions.'))) {
    errors.save = t('recipes.conversionRefused', {})
  }
  draft.sections.forEach((section, i) => {
    if (byField[`sections.${i}.name`]) sectionNames[section.key] = t('recipes.sectionNameRequired', {})
    section.items.forEach((line, j) => {
      const text = message(`sections.${i}.items.${j}.amount`, numberTooLong)
      if (text) amounts[line.key] = text
      if (byField[`sections.${i}.items.${j}.unit`]) unitErrors[line.key] = true
      if (byField[`sections.${i}.items.${j}.ingredient_id`]) errors.save = t('recipes.unknownIngredient', {})
    })
  })
  if (Object.keys(sectionNames).length > 0) errors.sectionNames = sectionNames
  if (Object.keys(amounts).length > 0) errors.amounts = amounts
  if (Object.keys(unitErrors).length > 0) errors.unitErrors = unitErrors
  return Object.keys(errors).length > 0 ? errors : null
}

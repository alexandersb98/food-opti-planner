import { expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { recipe, tag } from '../test-data'
import { checkRecipe, draftOf, emptyDraft, hasErrors, multiplier, serverErrors, type RecipeDraft } from './useRecipeDraft'

const { t } = makeI18n().global

/** A draft that passes, with `changes`. */
function draft(changes: Partial<RecipeDraft> = {}): RecipeDraft {
  return { ...emptyDraft(), name: 'Porridge', items: [{ ingredientId: 1, amount: '60' }], ...changes }
}

test.each([
  ['0.5', 500],
  ['2', 2000],
  ['1,25', 1250],
  ['.125', 125],
  ['123456789', 123456789000],
  ['0', null],
  ['-1', null],
  ['0.0001', null],
  ['1234567890', null],
  ['', null],
  ['x', null],
])('the multiplier %s is %s thousandths', (text, thousandths) => {
  expect(multiplier(text)).toBe(thousandths)
})

test('a draft that passes gives the fields to send', () => {
  const vegan = tag({ id: 1, name: 'vegan' })
  const { fields, errors } = checkRecipe(draft({ name: ' Porridge ', extraTagIds: new Set([1, 9]) }), [vegan], t)
  expect(hasErrors(errors)).toBe(false)
  expect(fields).toEqual({
    name: 'Porridge',
    items: [{ ingredient_id: 1, amount: '60' }],
    extra_tag_ids: [1],
    min_multiplier: '0.5',
    max_multiplier: '2',
    step: null,
    hard_max_multiplier: null,
    serving_cap_weight: '1',
  })
})

test('a recipe needs a name, ingredients and amounts above 0', () => {
  expect(checkRecipe(draft({ name: ' ' }), [], t).errors.name).toBe(t('common.nameRequired'))
  expect(checkRecipe(draft({ items: [] }), [], t).errors.items).toBe(t('recipes.noItems'))
  const { errors } = checkRecipe(draft({ items: [{ ingredientId: 3, amount: '0' }] }), [], t)
  expect(errors.amounts).toEqual({ 3: t('recipes.amountInvalid') })
  expect(hasErrors(errors)).toBe(true)
})

test.each([
  [{ min: '2', max: '1' }, 'max', 'recipes.belowMin'],
  [{ max: '2', hardMax: '1' }, 'hardMax', 'recipes.belowMax'],
  [{ min: '0.75', inSteps: true, step: '0.5' }, 'min', 'recipes.notInSteps'],
  [{ inSteps: true, step: 'x' }, 'step', 'recipes.multiplierInvalid'],
  [{ step: 'x' }, 'step', ''], // not in steps, so the step is not checked
  [{ penalty: '-1' }, 'penalty', 'recipes.penaltyInvalid'],
] as const)('%o marks %s with %s', (changes, field, key) => {
  expect(checkRecipe(draft(changes), [], t).errors[field]).toBe(key && t(key))
})

test("the server's refusals land on their fields", () => {
  const { fields } = checkRecipe(draft(), [], t)
  const errors = serverErrors(
    { name: 'name_in_use', max_multiplier: 'below_min', serving_cap_weight: 'decimal_max_digits', 'items.0.amount': 'x' },
    fields,
    t,
  )
  expect(errors).toEqual({
    name: t('recipes.nameInUse'),
    max: t('recipes.belowMin'),
    penalty: t('ingredients.numberTooLong'),
    amounts: { 1: t('ingredients.numberTooLong') },
  })
})

test('a refusal on no field it knows is none', () => {
  const { fields } = checkRecipe(draft(), [], t)
  expect(serverErrors({ name: 'too_long' }, fields, t)).toBeNull()
  expect(serverErrors({}, fields, t)).toBeNull()
})

test('a stored recipe without a step keeps the step as typed', () => {
  const stored = recipe({ id: 7, name: 'Porridge', step: null, hard_max_multiplier: '5' })
  expect(draftOf(stored, '0.25')).toMatchObject({ inSteps: false, step: '0.25', hardMax: '5' })
})

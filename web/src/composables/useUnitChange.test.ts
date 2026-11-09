import { afterEach, expect, test } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../i18n/en.json'
import { unitChange, unitChangeRefusal } from '../test-data'
import { refusalText, useUnitChange } from './useUnitChange'

afterEach(() => useUnitChange().answer(false))

const { t } = createI18n({ legacy: false, locale: 'en', messages: { en } }).global
const mgToG = { from: 'mg', to: 'g', attribute: 'Iron' }

test('a second question settles the first as no', async () => {
  const { ask, state } = useUnitChange()
  const request = { name: 'Iron', from: 'mg', to: 'µg', change: unitChange() }
  const first = ask(request)
  const second = ask({ ...request, name: 'Zinc' })
  await expect(first).resolves.toBe(false)
  expect(state.value?.request.name).toBe('Zinc')
  useUnitChange().answer(true)
  await expect(second).resolves.toBe(true)
  expect(state.value).toBeNull()
})

test('a goal bound that needs decimals says how many and what to raise', () => {
  const refusal = unitChangeRefusal({ type: 'conversion_needs_decimals', kind: 'goal', name: 'Iron per day', field: 'min', number: '0.5', converted: '0.0005', decimals_needed: 4 })
  expect(refusalText(t, refusal, mgToG)).toBe(
    "The goal Iron per day's minimum (0.5 mg) would need 4 decimals as g. Raise Iron's decimals first.",
  )
})

test('a goal bound that no decimals write says it can not be written exactly', () => {
  const refusal = unitChangeRefusal({ type: 'conversion_needs_decimals', kind: 'goal', name: 'Iron per day', field: 'zero_reference', number: '1', converted: '0.333333', decimals_needed: null })
  expect(refusalText(t, refusal, { from: 'tsk', to: 'US cup', attribute: 'Iron' })).toBe(
    "The goal Iron per day's zero reference (1 tsk) can't be written exactly in US cup.",
  )
})

test('a number that gets too large is named with what it would become', () => {
  const refusal = unitChangeRefusal({ type: 'conversion_too_large', kind: 'ingredient_value', name: 'Oats', field: 'value', number: '999999999', converted: '999999999000', decimals_needed: null })
  expect(refusalText(t, refusal, { from: 'mg', to: 'µg', attribute: 'Iron' })).toBe(
    "The Iron value of Oats (999999999 mg) would be 999999999000 µg, which is too large.",
  )
})

test('an amount that rounds to zero asks for a smaller unit', () => {
  const refusal = unitChangeRefusal({ type: 'conversion_rounds_to_zero', kind: 'recipe_amount', name: 'Porridge', field: 'amount', number: '0.0004', converted: '0' })
  expect(refusalText(t, refusal, { from: 'g', to: 'kg' })).toBe(
    'The amount in Porridge (0.0004 g) would round to 0 in kg. Use a smaller unit.',
  )
})

test('an energy unit for an ingredient reuses the ingredient form text', () => {
  expect(refusalText(t, unitChangeRefusal({ type: 'unit_not_for_ingredient' }), { from: 'g', to: 'kcal' })).toBe(
    'An ingredient is measured in an amount of food, such as g, dl or pieces.',
  )
})

test('a linked ingredient refused a unit that is not mass says why', () => {
  expect(refusalText(t, unitChangeRefusal({ type: 'unit_not_for_source' }), { from: 'g', to: 'dl' })).toBe(
    "An ingredient from a data source can only be measured in a mass unit such as g or kg, as the source's values are per 100 g of food.",
  )
})

test("a source value that gets too large is named as the source's", () => {
  const refusal = unitChangeRefusal({ type: 'conversion_too_large', kind: 'source_value', name: 'Oats', field: 'source_value', number: '999999999', converted: '999999999000', decimals_needed: null })
  expect(refusalText(t, refusal, { from: 'mg', to: 'µg', attribute: 'Iron' })).toBe(
    "The source's Iron value of Oats (999999999 mg) would be 999999999000 µg, which is too large.",
  )
})

test('a unit change refused for what depends on it counts conversions and lines, leaving out a zero', () => {
  const both = unitChangeRefusal({ type: 'unit_has_dependents', name: 'Oats', conversions: 2, lines: 3 })
  expect(refusalText(t, both, { from: 'g', to: 'dl' })).toBe(
    "Oats has 2 conversions and 3 recipe lines in other units, so its unit can't change from g to dl. Delete or change them first.",
  )
  const one = unitChangeRefusal({ type: 'unit_has_dependents', name: 'Oats', conversions: 1, lines: 0 })
  expect(refusalText(t, one, { from: 'g', to: 'dl' })).toBe(
    "Oats has 1 conversion, so its unit can't change from g to dl. Delete or change them first.",
  )
  const line = unitChangeRefusal({ type: 'unit_has_dependents', name: 'Oats', conversions: 0, lines: 1 })
  expect(refusalText(t, line, { from: 'g', to: 'dl' })).toBe(
    "Oats has 1 recipe line in another unit, so its unit can't change from g to dl. Delete or change them first.",
  )
})

test('a conversion for the new unit says to delete it first', () => {
  const refusal = unitChangeRefusal({ type: 'conversion_for_new_unit', name: 'Oats', unit: 'kg' })
  expect(refusalText(t, refusal, { from: 'g', to: 'kg' })).toBe('Oats has a conversion for kg. Delete the conversion for kg first.')
})

test('a conversion factor that rounds to zero is named by its unit', () => {
  const refusal = unitChangeRefusal({ type: 'conversion_rounds_to_zero', kind: 'conversion', name: 'pinch', field: 'factor', number: '0.0004', converted: '0' })
  expect(refusalText(t, refusal, { from: 'g', to: 'kg' })).toBe(
    'The conversion for pinch (0.0004 g) would round to 0 in kg. Use a smaller unit.',
  )
})

// Every `field` server/unit_change.py's Number can carry.
test.each(['value', 'source_value', 'min', 'max', 'zero_reference', 'basis', 'amount', 'factor'])(
  'the refusal field %s has text',
  (field) => {
    const key = `unitChange.fields.${field}`
    const text = t(key)
    expect(text).not.toBe(key)
    expect(text).not.toBe('')
  },
)

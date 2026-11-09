import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { makeI18n } from '../i18n'
import { fakeServer } from '../test-app'
import { importedLine, importedRecipe, ingredient, lines, recipe, tag } from '../test-data'
import {
  checkRecipe,
  draftOf,
  draftOfImport,
  emptyDraft,
  hasErrors,
  multiplier,
  serverErrors,
  useRecipeDraft,
  type DraftLine,
  type RecipeDraft,
} from './useRecipeDraft'

const { t } = makeI18n().global

/** A draft that passes, with `changes`. */
function draft(changes: Partial<RecipeDraft> = {}): RecipeDraft {
  const base = emptyDraft()
  return { ...base, name: 'Porridge', sections: [{ ...base.sections[0]!, items: [line(1, '60')] }], ...changes }
}

let lineKey = 100
function line(ingredientId: number, amount: string, originalText = '', unit = ''): DraftLine {
  return { key: ++lineKey, ingredientId, amount, unit, originalText, food: '', skipped: false, notAnIngredient: false, suggestedFactor: null }
}

/** A draft of named sections, each a list of (ingredient id, amount) lines. */
function sectioned(...sections: [string, [number, string][]][]): RecipeDraft['sections'] {
  return sections.map(([name, items], i) => ({ key: 200 + i, name, items: items.map(([id, amount]) => line(id, amount)) }))
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
    servings: 1,
    sections: [{ name: '', items: [{ ingredient_id: 1, amount: '60', unit: '', original_text: '' }] }],
    instructions: '',
    source_url: '',
    extra_tag_ids: [1],
    min_multiplier: '0.5',
    max_multiplier: '2',
    step: null,
    hard_max_multiplier: null,
    serving_cap_weight: '1',
    new_conversions: [],
  })
})

test('a recipe needs a name, ingredients and amounts above 0', () => {
  expect(checkRecipe(draft({ name: ' ' }), [], t).errors.name).toBe(t('common.nameRequired'))
  expect(checkRecipe(draft({ sections: sectioned(['', []]) }), [], t).errors.items).toBe(t('recipes.noItems'))
  const sections = sectioned(['', [[3, '0']]])
  const { errors } = checkRecipe(draft({ sections }), [], t)
  expect(errors.amounts).toEqual({ [sections[0]!.items[0]!.key]: t('recipes.amountInvalid') })
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
  const sections = sectioned(['A', [[1, '1']]], ['B', [[1, '2'], [2, '3']]])
  const errors = serverErrors(
    {
      name: 'name_in_use',
      max_multiplier: 'below_min',
      serving_cap_weight: 'decimal_max_digits',
      'sections.1.items.1.amount': 'decimal_max_digits',
    },
    draft({ sections }),
    t,
  )
  expect(errors).toEqual({
    name: t('recipes.nameInUse'),
    max: t('recipes.belowMin'),
    penalty: t('ingredients.numberTooLong'),
    amounts: { [sections[1]!.items[1]!.key]: t('ingredients.numberTooLong') },
  })
})

test('a refusal on no field it knows is none', () => {
  expect(serverErrors({ name: 'too_long' }, draft(), t)).toBeNull()
  expect(serverErrors({}, draft(), t)).toBeNull()
})

test('a stored recipe without a step keeps the step as typed', () => {
  const stored = recipe({ id: 7, name: 'Porridge', step: null, hard_max_multiplier: '5' })
  expect(draftOf(stored, '0.25')).toMatchObject({ inSteps: false, step: '0.25', hardMax: '5' })
})

test('a new draft is one unnamed section, serving 1, with no instructions or source', () => {
  const fresh = emptyDraft()
  expect(fresh.sections).toEqual([{ key: expect.any(Number), name: '', items: [] }])
  expect([fresh.servings, fresh.instructions, fresh.sourceUrl]).toEqual(['1', '', ''])
})

test('a stored recipe is drafted with its sections, lines, original text, servings and source', () => {
  const stored = recipe({
    id: 7,
    name: 'Porridge',
    servings: 4,
    instructions: 'Stir.\nServe.',
    source_url: 'https://example.com/p',
    sections: [
      { name: 'Base', items: [{ ingredient_id: 1, amount: '60', unit: '', original_text: '60 g oats' }] },
      { name: 'Top', items: [{ ingredient_id: 1, amount: '10', unit: '', original_text: '' }] },
    ],
  })
  const drafted = draftOf(stored, '0.5')
  expect([drafted.servings, drafted.instructions, drafted.sourceUrl]).toEqual(['4', 'Stir.\nServe.', 'https://example.com/p'])
  expect(drafted.sections.map((s) => [s.name, s.items.map((i) => [i.ingredientId, i.amount, i.originalText])])).toEqual([
    ['Base', [[1, '60', '60 g oats']]],
    ['Top', [[1, '10', '']]],
  ])
  const keys = drafted.sections.flatMap((s) => [s.key, ...s.items.map((i) => i.key)])
  expect(new Set(keys).size).toBe(keys.length)
})

test('the fields sent have the servings as a number, the instructions as typed and the link trimmed', () => {
  const { fields, errors } = checkRecipe(
    draft({ servings: ' 4 ', instructions: ' Stir.\n', sourceUrl: ' https://example.com/r?a=1 ' }),
    [],
    t,
  )
  expect(hasErrors(errors)).toBe(false)
  expect(fields).toMatchObject({ servings: 4, instructions: ' Stir.\n', source_url: 'https://example.com/r?a=1' })
})

test.each(['0', '1.5', 'abc', '1001', '', '-1'])('the servings %j are refused', (servings) => {
  expect(checkRecipe(draft({ servings }), [], t).errors.servings).toBe(t('recipes.servingsInvalid'))
})

test.each(['1', '1000', '12'])('the servings %s are accepted', (servings) => {
  expect(checkRecipe(draft({ servings }), [], t).errors.servings).toBe('')
})

test.each(['example.com', 'ftp://x', 'javascript:alert(1)', 'https://a b'])('the source %j is refused', (sourceUrl) => {
  expect(checkRecipe(draft({ sourceUrl }), [], t).errors.sourceUrl).toBe(t('recipes.sourceInvalid'))
})

test.each(['', '  ', 'https://example.com/r?a=1', 'http://example.com'])('the source %j is accepted', (sourceUrl) => {
  expect(checkRecipe(draft({ sourceUrl }), [], t).errors.sourceUrl).toBe('')
})

test('every section needs a name when there are several, and one may stay unnamed', () => {
  expect(checkRecipe(draft(), [], t).errors.sectionNames).toEqual({})
  const sections = sectioned(['Base', [[1, '1']]], [' ', [[2, '1']]])
  const { errors, fields } = checkRecipe(draft({ sections }), [], t)
  expect(errors.sectionNames).toEqual({ [sections[1]!.key]: t('recipes.sectionNameRequired') })
  expect(fields.sections.map((s) => s.name)).toEqual(['Base', ''])
})

test('the same ingredient on two lines is accepted and sent as two lines', () => {
  const sections = sectioned(['Base', [[1, '40']]], ['Top', [[1, '20']]])
  const { fields, errors } = checkRecipe(draft({ sections }), [], t)
  expect(hasErrors(errors)).toBe(false)
  expect(fields.sections.map((s) => s.items.map((i) => [i.ingredient_id, i.amount]))).toEqual([[[1, '40']], [[1, '20']]])
})

test("the server's section, servings, link and line errors land on their keys", () => {
  const sections = sectioned(['A', [[1, '1']]], ['', [[2, '1']]])
  expect(
    serverErrors(
      { servings: 'less_than_equal', source_url: 'invalid_url', 'sections.1.name': 'name_required', sections: 'no_items' },
      draft({ sections }),
      t,
    ),
  ).toEqual({
    servings: t('recipes.servingsInvalid'),
    sourceUrl: t('recipes.sourceInvalid'),
    sectionNames: { [sections[1]!.key]: t('recipes.sectionNameRequired') },
    items: t('recipes.noItems'),
  })
  expect(serverErrors({ 'sections.0.items.0.ingredient_id': 'unknown_ingredient' }, draft({ sections }), t)).toEqual({
    save: t('recipes.unknownIngredient'),
  })
})

// The composable: sections and lines.

const oats = ingredient({ id: 1, name: 'Oats' })
const milk = ingredient({ id: 2, name: 'Milk' })

function mounted(id: number | null = null) {
  let draft!: ReturnType<typeof useRecipeDraft>
  const Host = defineComponent({
    setup() {
      draft = useRecipeDraft(id)
      return () => h('div')
    },
  })
  const wrapper = mount(Host, { global: { plugins: [makeI18n()] } })
  return { wrapper, draft }
}

afterEach(() => vi.unstubAllGlobals())

function shape(draft: RecipeDraft) {
  return draft.sections.map((section) => [section.name, section.items.map((i) => i.ingredientId)])
}

test('lines are added to the section asked, removed and moved, and none is lost', async () => {
  fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted()
  draft.addSection()
  draft.addIngredient(0, oats)
  draft.addIngredient(1, milk)
  draft.addIngredient(1, oats)
  expect(shape(draft.draft)).toEqual([['', [1]], ['', [2, 1]]])
  expect(draft.lineCount.value).toBe(3)
  draft.moveLine(1, 0, 0)
  expect(shape(draft.draft)).toEqual([['', [1, 2]], ['', [1]]])
  draft.removeLine(1, 0)
  expect(draft.lineCount.value).toBe(2)
  wrapper.unmount()
})

test('removing a section moves its lines to the section above, or below for the first', () => {
  const { wrapper, draft } = mounted()
  draft.draft.sections = sectioned(['A', [[1, '1']]], ['B', [[2, '1']]], ['C', [[1, '2'], [2, '2']]])
  const before = draft.lineCount.value
  draft.removeSection(1)
  expect(shape(draft.draft)).toEqual([['A', [1, 2]], ['C', [1, 2]]])
  draft.removeSection(0)
  expect(shape(draft.draft)).toEqual([['C', [1, 2, 1, 2]]])
  expect(draft.lineCount.value).toBe(before)
  draft.removeSection(0) // the only section stays
  expect(draft.draft.sections).toHaveLength(1)
  wrapper.unmount()
})

test('the servings number is the typed one while valid, else 1', () => {
  const { wrapper, draft } = mounted()
  draft.draft.servings = '4'
  expect(draft.servingsNumber.value).toBe(4)
  draft.draft.servings = 'x'
  expect(draft.servingsNumber.value).toBe(1)
  draft.draft.servings = '0'
  expect(draft.servingsNumber.value).toBe(1)
  wrapper.unmount()
})

test('the derived tags are asked once for an ingredient on two lines', async () => {
  const calls = fakeServer({ 'POST /api/recipes/derived-tags': { body: [1] } })
  const { wrapper, draft } = mounted()
  draft.addIngredient(0, oats)
  await flushPromises()
  draft.addSection()
  draft.addIngredient(1, oats)
  await flushPromises()
  expect(calls.filter((call) => call === 'POST /api/recipes/derived-tags')).toHaveLength(1)
  expect(draft.derivedTagIds.value).toEqual([1])
  wrapper.unmount()
})

test('a recipe opened is not asked about, though its lines are in sections', async () => {
  const calls = fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted(7)
  draft.fillDraft(
    recipe({ id: 7, name: 'Porridge', sections: lines([2, '1'], [1, '2'], [2, '3']), derived_tag_ids: [5] }),
  )
  await flushPromises()
  expect(calls).toEqual([])
  expect(draft.derivedTagIds.value).toEqual([5])
  wrapper.unmount()
})

// Line units.

test('a line keeps its unit and sends it trimmed', () => {
  const base = draft()
  const sections = [{ ...base.sections[0]!, items: [line(1, '60'), line(1, '1', '', ' dl ')] }]
  const { fields, errors } = checkRecipe(draft({ sections }), [], t)
  expect(hasErrors(errors)).toBe(false)
  expect(fields.sections[0]!.items.map((i) => i.unit)).toEqual(['', 'dl'])
  const stored = recipe({
    id: 7,
    name: 'Porridge',
    sections: [{ name: '', items: [{ ingredient_id: 1, amount: '1', unit: 'dl', original_text: '' }] }],
  })
  expect(draftOf(stored, '0.5').sections[0]!.items[0]!.unit).toBe('dl')
})

test('a line whose unit does not convert is refused on its key', () => {
  const base = draft()
  const sections = [{ ...base.sections[0]!, items: [line(1, '60'), line(1, '1', '', 'dl')] }]
  const wrong = draft({ sections })
  const bad = wrong.sections[0]!.items[1]!
  const { errors } = checkRecipe(wrong, [], t, (l) => l.unit !== 'dl')
  expect(errors.unitErrors).toEqual({ [bad.key]: true })
  expect(hasErrors(errors)).toBe(true)
})

test("the server's unit errors land on the line", () => {
  const base = draft()
  const sections = [{ ...base.sections[0]!, items: [line(1, '60'), line(1, '1', '', 'dl')] }]
  const wrong = draft({ sections })
  const key = wrong.sections[0]!.items[1]!.key
  expect(serverErrors({ 'sections.0.items.1.unit': 'unit_not_convertible' }, wrong, t)).toEqual({ unitErrors: { [key]: true } })
  expect(serverErrors({ 'sections.0.items.1.unit': 'unit_not_for_ingredient' }, wrong, t)).toEqual({ unitErrors: { [key]: true } })
})

test('a line added starts in the ingredient\'s own unit', () => {
  const { wrapper, draft: drafted } = mounted()
  drafted.addIngredient(0, oats)
  expect(drafted.draft.sections[0]!.items[0]!.unit).toBe('')
  wrapper.unmount()
})

// the import review -----------------------------------------------------------

function imported() {
  return importedRecipe({
    cut: true,
    sections: [
      {
        name: '',
        lines: [
          importedLine({ original_text: '100 g oats', ingredient_id: 1, status: 'own_unit' }),
          importedLine({ original_text: '3 dl milk', food: 'milk', amount: '3', unit: 'dl', ingredient_id: 2, status: 'needs_factor', suggested_factor: '50' }),
          importedLine({ original_text: 'salt to taste', food: 'salt', amount: null, status: 'not_an_ingredient' }),
        ],
      },
    ],
  })
}

test('an imported recipe is filled as typed, with the review state', () => {
  const filled = draftOfImport(imported(), emptyDraft())
  expect(filled).toMatchObject({ name: 'Imported porridge', servings: '2', instructions: 'Boil.\nStir.', imported: { cut: true }, pending: [] })
  const [oats, milk, salt] = filled.sections[0]!.items
  expect(oats).toMatchObject({ ingredientId: 1, amount: '100', unit: '', originalText: '100 g oats', skipped: false, notAnIngredient: false })
  expect(milk).toMatchObject({ ingredientId: 2, unit: 'dl', food: 'milk', suggestedFactor: '50', skipped: false })
  expect(salt).toMatchObject({ ingredientId: null, amount: '', skipped: true, notAnIngredient: true })
})

test('fillImported fills the draft of the composable', () => {
  fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted()
  draft.fillImported(imported())
  expect(draft.draft.name).toBe('Imported porridge')
  expect(draft.draft.imported).toEqual({ cut: true })
  wrapper.unmount()
})

function reviewDraft(changes: Partial<RecipeDraft> = {}) {
  return { ...draftOfImport(imported(), emptyDraft()), ...changes }
}

test('a skipped line is not validated or sent', () => {
  const d = reviewDraft()
  d.sections[0]!.items[1]!.skipped = true
  const { fields, errors } = checkRecipe(d, [], t)
  expect(hasErrors(errors)).toBe(false)
  expect(fields.sections[0]!.items.map((i) => i.ingredient_id)).toEqual([1])
})

test('a kept line with no ingredient is refused on its key', () => {
  const d = reviewDraft()
  const salt = d.sections[0]!.items[2]!
  salt.skipped = false
  const { errors } = checkRecipe(d, [], t)
  expect(errors.lineIngredients).toEqual({ [salt.key]: t('recipes.pickIngredient') })
  expect(hasErrors(errors)).toBe(true)
})

test('a recipe whose lines are all skipped needs an ingredient', () => {
  const d = reviewDraft()
  for (const l of d.sections[0]!.items) l.skipped = true
  expect(checkRecipe(d, [], t).errors.items).toBe(t('recipes.noItems'))
})

test('new_conversions holds only the pending conversions a kept line uses, with their source', () => {
  const d = reviewDraft({
    pending: [
      { ingredientId: 2, unit: 'DL', factor: '50', source: 'ai' },
      { ingredientId: 2, unit: 'klyfta', factor: '5', source: 'user' },
      { ingredientId: 1, unit: 'dl', factor: '40', source: 'user' },
    ],
  })
  d.sections[0]!.items[2]!.skipped = true
  expect(checkRecipe(d, [], t).fields.new_conversions).toEqual([{ ingredient_id: 2, unit: 'DL', factor: '50', source: 'ai' }])
  d.sections[0]!.items[1]!.skipped = true
  expect(checkRecipe(d, [], t).fields.new_conversions).toEqual([])
})

test('acceptFactor replaces a pending conversion of the same key; forgetFactor removes it', () => {
  const { wrapper, draft } = mounted()
  draft.acceptFactor(2, 'dl', '50', '50')
  draft.acceptFactor(2, 'DL', '60', '50')
  expect(draft.draft.pending).toEqual([{ ingredientId: 2, unit: 'DL', factor: '60', source: 'user' }])
  draft.forgetFactor(2, 'dl')
  expect(draft.draft.pending).toEqual([])
  wrapper.unmount()
})

test('skipLine and unskipLine toggle a line; setLineIngredient keeps amount and unit', () => {
  fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted()
  draft.fillImported(imported())
  draft.skipLine(0, 0)
  expect(draft.draft.sections[0]!.items[0]!.skipped).toBe(true)
  draft.unskipLine(0, 0)
  expect(draft.draft.sections[0]!.items[0]!.skipped).toBe(false)
  draft.setLineIngredient(0, 2, oats)
  expect(draft.draft.sections[0]!.items[2]).toMatchObject({ ingredientId: oats.id, amount: '', unit: '' })
  draft.setLineIngredient(0, 1, oats)
  expect(draft.draft.sections[0]!.items[1]).toMatchObject({ ingredientId: oats.id, amount: '3', unit: 'dl' })
  wrapper.unmount()
})

test('the derived-tags question ignores skipped and unmatched lines', async () => {
  const asked: unknown[] = []
  fakeServer({
    'POST /api/recipes/derived-tags': (body) => {
      asked.push(body)
      return { body: [] }
    },
  })
  const { wrapper, draft } = mounted()
  draft.fillImported(imported())
  draft.skipLine(0, 0)
  await flushPromises()
  expect(asked).toEqual([{ ingredient_ids: [2] }])
  wrapper.unmount()
})

test('the server refusing a new conversion shows the save message', () => {
  const shown = serverErrors({ 'new_conversions.0.unit': 'duplicate' }, draft(), t)
  expect(shown).toEqual({ save: t('recipes.conversionRefused') })
})

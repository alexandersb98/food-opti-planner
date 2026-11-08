import { afterEach, expect, test, vi } from 'vitest'
import { resetPreferences } from '../preferences'
import {
  button,
  chooseUnit,
  click,
  dialog,
  fakeServer,
  field,
  mountApp,
  openUnitList,
  texts,
  unitRoutes,
  type FakeServer,
} from '../test-app'
import { attribute, ingredient, recipe, tag, unitChange, unitChangeRefusal } from '../test-data'
import { resetUnits } from '../units'

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal', ingredient_count: 1 })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1, ingredient_count: 1 })
const fat = attribute({ id: 3, name: 'Fat', unit: 'g', decimals: 1 })
const vegan = tag({ id: 1, name: 'vegan', ingredient_count: 1 })
const nuts = tag({ id: 2, name: 'contains-nuts', derive: 'any' })
const oats = ingredient({
  id: 7,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
  tag_ids: [1],
})

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(path: string, server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy, protein, fat] },
    'GET /api/tags': { body: [vegan, nuts] },
    'GET /api/ingredients/7': { body: oats },
    'GET /api/ingredients': { body: [] },
    ...server,
  })
  const { wrapper, router } = await mountApp(path)
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function value(wrapper: Wrapper, label: string) {
  return field(wrapper, label).element.value
}

/** Each tag button's label and whether it is on. */
function tags(wrapper: Wrapper) {
  return wrapper
    .findAll('.tag-choice')
    .map((tag) => [tag.text().replace('check', '').trim(), tag.attributes('aria-pressed')])
}

/** A save request's body, recorded. */
function recorder(status: number, reply: (body: object) => object) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: reply(body as object) }
  }
  return { sent, handler }
}

test('an ingredient opens with its fields, values and tags', async () => {
  const { wrapper } = await mountPage('/ingredients/7')
  expect(wrapper.get('h1').text()).toBe('Edit ingredient')
  expect([value(wrapper, 'Name'), value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual([
    'Oats',
    'g',
    '100',
  ])
  expect([value(wrapper, 'Energy'), value(wrapper, 'Protein'), value(wrapper, 'Fat')]).toEqual(['389', '16.9', ''])
  expect(wrapper.text()).toContain('kcal')
  expect(tags(wrapper)).toEqual([
    ['vegan', 'true'],
    ['contains-nuts', 'false'],
  ])
  expect(wrapper.text()).toContain('Used in no recipes')
  wrapper.unmount()
})

test('Save sends the typed values, leaving out empty ones, and returns to the list', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...oats, ...body }))
  const { wrapper, router } = await mountPage('/ingredients/7', { 'PUT /api/ingredients/7': handler })
  await field(wrapper, 'Name').setValue('Rolled oats')
  await field(wrapper, 'Energy').setValue('')
  await field(wrapper, 'Fat').setValue(' 6,5 ')
  await click(wrapper.findAll('.tag-choice')[0]!)
  await click(wrapper.findAll('.tag-choice')[1]!)
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    {
      name: 'Rolled oats',
      unit: 'g',
      basis: '100',
      values: [
        { attribute_id: 2, value: '16.9' },
        { attribute_id: 3, value: '6.5' },
      ],
      tag_ids: [2],
    },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/ingredients')
  wrapper.unmount()
})

test('a new ingredient starts in grams per 100, and the basis follows the unit', async () => {
  const { sent, handler } = recorder(201, (body) => ({ ...body, id: 8, recipe_count: 0 }))
  const { wrapper, router } = await mountPage('/ingredients/new', { 'POST /api/ingredients': handler })
  expect(wrapper.get('h1').text()).toBe('New ingredient')
  expect([value(wrapper, 'Name'), value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual([
    '',
    'g',
    '100',
  ])
  expect(wrapper.text()).not.toContain('Delete')
  expect(wrapper.text()).not.toContain('Used in')

  await field(wrapper, 'Measured in').setValue('st')
  expect([value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual(['st', '1'])
  await field(wrapper, 'Measured in').setValue('ml')
  expect(value(wrapper, 'Value basis')).toBe('100')
  await field(wrapper, 'Measured in').setValue('msk')
  expect(value(wrapper, 'Value basis')).toBe('100')
  await field(wrapper, 'Measured in').setValue('st')
  expect(value(wrapper, 'Value basis')).toBe('1')

  await field(wrapper, 'Name').setValue('Egg')
  await chooseUnit(wrapper, 'Measured in', 'st (piece)')
  expect([value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual(['st', '1'])
  await field(wrapper, 'Protein').setValue('6.3')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    { name: 'Egg', unit: 'st', basis: '1', values: [{ attribute_id: 2, value: '6.3' }], tag_ids: [] },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/ingredients')
  wrapper.unmount()
})

test('a new ingredient starts in the preferred mass unit', async () => {
  const { wrapper } = await mountPage('/ingredients/new', unitRoutes({ 'unit.mass': 'kg' }))
  expect([value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual(['kg', '100'])
  wrapper.unmount()
})

test('without the preferences a new ingredient starts in grams and the page still saves', async () => {
  const { sent, handler } = recorder(201, (body) => ({ ...body, id: 8, recipe_count: 0 }))
  const { wrapper } = await mountPage('/ingredients/new', {
    'GET /api/preferences': 500,
    'POST /api/ingredients': handler,
  })
  expect([value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual(['g', '100'])
  await field(wrapper, 'Name').setValue('Egg')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([{ name: 'Egg', unit: 'g', basis: '100', values: [], tag_ids: [] }])
  wrapper.unmount()
})

test('a unit chosen from the list is sent as its symbol, typed text as typed (unit changes confirmed)', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...oats, ...body }))
  const { wrapper } = await mountPage('/ingredients/7', {
    'POST /api/ingredients/7/unit-change': { body: unitChange({ factor: '0.001', counts: { basis: 1, recipe_amounts: 0 } }) },
    'PUT /api/ingredients/7': handler,
  })
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  await dialog().click('Convert')
  expect((sent[0] as { unit: string }).unit).toBe('kg')
  wrapper.unmount()

  const second = await mountPage('/ingredients/7', {
    'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'same', factor: null }) },
    'PUT /api/ingredients/7': handler,
  })
  await field(second.wrapper, 'Measured in').setValue('gram')
  await click(button(second.wrapper, 'Save'))
  expect((sent[1] as { unit: string }).unit).toBe('gram')
  second.wrapper.unmount()
})

test('the unit list offers mass, volume and pieces, not energy', async () => {
  const { wrapper } = await mountPage('/ingredients/new')
  const rows = await openUnitList(wrapper, 'Measured in')
  expect(rows.filter((row) => row.startsWith('#'))).toEqual(['# Mass', '# Volume', '# Other'])
  expect(rows).toContain('st (piece)')
  expect(rows).not.toContain('kcal (kilocalorie)')
  wrapper.unmount()
})

test('an energy unit the server refuses is shown under the field', async () => {
  const refusal = {
    status: 422,
    body: { detail: [{ loc: ['body', 'unit'], type: 'unit_not_for_ingredient', msg: 'x' }] },
  }
  const { wrapper, router } = await mountPage('/ingredients/new', { 'POST /api/ingredients': refusal })
  await field(wrapper, 'Name').setValue('Oil')
  await field(wrapper, 'Measured in').setValue('kcal')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('An ingredient is measured in an amount of food, such as g, dl or pieces.')
  expect(wrapper.text()).not.toContain('Could not save')
  expect(router.currentRoute.value.fullPath).toBe('/ingredients/new')
  await field(wrapper, 'Measured in').setValue('g')
  expect(wrapper.text()).not.toContain('An ingredient is measured in an amount')
  wrapper.unmount()
})

test('without the catalogue the basis still follows g', async () => {
  const { wrapper } = await mountPage('/ingredients/new', { 'GET /api/units': 500 })
  await field(wrapper, 'Measured in').setValue('st')
  expect(value(wrapper, 'Value basis')).toBe('1')
  wrapper.unmount()
})

test('a basis changed by hand stays when the unit changes', async () => {
  const { wrapper } = await mountPage('/ingredients/new')
  await field(wrapper, 'Value basis').setValue('50')
  await chooseUnit(wrapper, 'Measured in', 'st (piece)')
  expect(value(wrapper, 'Value basis')).toBe('50')
  wrapper.unmount()
})

test('an existing basis is kept when the ingredient is opened', async () => {
  const { wrapper } = await mountPage('/ingredients/7', {
    'GET /api/ingredients/7': { body: { ...oats, unit: 'pcs', basis: '100' } },
  })
  expect([value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual(['pcs', '100'])
  wrapper.unmount()
})

test('wrong fields are marked and nothing is sent', async () => {
  const { wrapper, calls } = await mountPage('/ingredients/7')
  await field(wrapper, 'Name').setValue(' ')
  await field(wrapper, 'Measured in').setValue('')
  await field(wrapper, 'Value basis').setValue('0')
  await field(wrapper, 'Fat').setValue('a lot')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('Enter a name.')
  expect(wrapper.text()).toContain('Enter a unit.')
  expect(wrapper.text()).toContain('Enter a number above 0.')
  expect(wrapper.text()).toContain('Enter a number, or leave it empty.')
  expect(calls).not.toContain('PUT /api/ingredients/7')
  wrapper.unmount()
})

test('a name in use, and a number the server finds too long, are shown on their fields', async () => {
  const { wrapper, router } = await mountPage('/ingredients/7', {
    'PUT /api/ingredients/7': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('An ingredient with this name already exists.')
  expect(router.currentRoute.value.fullPath).toBe('/ingredients/7')

  fakeServer({
    'PUT /api/ingredients/7': {
      status: 422,
      body: { detail: [{ loc: ['body', 'values', 1, 'value'], type: 'decimal_max_places', msg: 'long' }] },
    },
  })
  await field(wrapper, 'Protein').setValue('16.0000001')
  await click(button(wrapper, 'Save'))
  const protein = wrapper.findAll('.q-field').find((f) => f.find('input[aria-label="Protein"]').exists())!
  expect(protein.text()).toContain('Use at most 9 digits before the point and 6 after.')
  wrapper.unmount()
})

test('any other failed save says so', async () => {
  const { wrapper } = await mountPage('/ingredients/7', { 'PUT /api/ingredients/7': 500 })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  wrapper.unmount()
})

test('delete asks first, then deletes and returns to the list', async () => {
  const { wrapper, router, calls } = await mountPage('/ingredients/7', { 'DELETE /api/ingredients/7': 204 })
  await click(button(wrapper, 'Delete'))
  expect(dialog().text).toContain('Delete Oats?')
  expect(calls).not.toContain('DELETE /api/ingredients/7')
  await dialog().click('Delete')
  expect(calls).toContain('DELETE /api/ingredients/7')
  expect(router.currentRoute.value.fullPath).toBe('/ingredients')
  wrapper.unmount()
})

test('an ingredient recipes use cannot be deleted', async () => {
  const { wrapper } = await mountPage('/ingredients/7', {
    'GET /api/ingredients/7': { body: { ...oats, recipe_count: 2 } },
  })
  expect(button(wrapper, 'Delete').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Used in 2 recipes')
  expect(wrapper.text()).toContain("Recipes use it, so it can't be deleted.")
  wrapper.unmount()
})

test('Show lists the recipes that use the ingredient, which open their editor', async () => {
  const uses = (id: number, name: string, ingredientId: number) =>
    recipe({ id, name, items: [{ ingredient_id: ingredientId, amount: '1' }] })
  const { wrapper, router } = await mountPage('/ingredients/7', {
    'GET /api/ingredients/7': { body: { ...oats, recipe_count: 2 } },
    'GET /api/recipes': { body: [uses(1, 'Porridge', 7), uses(2, 'Omelette', 8), uses(3, 'Muesli', 7)] },
    'GET /api/recipes/3': { body: uses(3, 'Muesli', 7) },
  })
  await click(button(wrapper, 'Show'))
  expect(texts(wrapper, '.used-in .q-item__section--main')).toEqual(['Muesli', 'Porridge'])
  expect(wrapper.text()).not.toContain('Show')
  await click(wrapper.findAll('.used-in .q-item')[0]!)
  expect(router.currentRoute.value.fullPath).toBe('/recipes/3')
  wrapper.unmount()
})

test('an ingredient no recipe uses has nothing to show', async () => {
  const { wrapper } = await mountPage('/ingredients/7')
  expect(wrapper.text()).toContain('Used in no recipes')
  expect(wrapper.text()).not.toContain('Show')
  wrapper.unmount()
})

test('without attributes or tags, the page says where to add them', async () => {
  const { wrapper } = await mountPage('/ingredients/new', {
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
  })
  expect(wrapper.text()).toContain('No attributes yet; add them on the Attributes page.')
  expect(wrapper.text()).toContain('No tags yet; add them on the Tags page.')
  wrapper.unmount()
})

test('an unknown ingredient fails to load', async () => {
  const { wrapper } = await mountPage('/ingredients/99')
  expect(wrapper.text()).toContain('Could not load the ingredient.')
  wrapper.unmount()
})

test('the back button returns to the list without saving', async () => {
  const { wrapper, router, calls } = await mountPage('/ingredients/7')
  await field(wrapper, 'Name').setValue('Changed')
  await click(wrapper.get('[aria-label="Back"]'))
  expect(router.currentRoute.value.fullPath).toBe('/ingredients')
  expect(calls).not.toContain('PUT /api/ingredients/7')
  wrapper.unmount()
})

// Changing the unit of a saved ingredient: the preview, then the dialog.

const basisChange = unitChange({ factor: '0.001', counts: { basis: 1, recipe_amounts: 4 } })

async function openOats(server: FakeServer = {}) {
  const previews: unknown[] = []
  const { sent, handler } = recorder(200, (body) => ({ ...oats, ...body }))
  const page = await mountPage('/ingredients/7', {
    'POST /api/ingredients/7/unit-change': (body) => {
      previews.push(body)
      return { body: basisChange }
    },
    'PUT /api/ingredients/7': handler,
    ...server,
  })
  return { ...page, sent, previews }
}

test('a unit change asks first, and Convert saves the basis as typed', async () => {
  const { wrapper, router, sent, previews } = await openOats()
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  expect(previews).toEqual([{ unit: 'kg', basis: '100' }])
  expect(sent).toEqual([])
  expect(dialog().text).toContain("Convert Oats's numbers?")
  expect(dialog().text).toContain('Oats: the basis and 4 recipe amounts will be converted from g to kg (× 0.001).')
  await dialog().click('Convert')
  expect(sent).toEqual([expect.objectContaining({ unit: 'kg', basis: '100' })])
  expect(router.currentRoute.value.fullPath).toBe('/ingredients')
  wrapper.unmount()
})

test('Cancel sends nothing and keeps the form with the typed unit', async () => {
  const { wrapper, router, sent } = await openOats()
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  await dialog().click('Cancel')
  expect(sent).toEqual([])
  expect(value(wrapper, 'Measured in')).toBe('kg')
  expect(router.currentRoute.value.fullPath).toBe('/ingredients/7')
  wrapper.unmount()
})

test('a basis edited by hand is sent as typed in the preview and the save', async () => {
  const { wrapper, sent, previews } = await openOats()
  await field(wrapper, 'Value basis').setValue('50')
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  await dialog().click('Convert')
  expect(previews).toEqual([{ unit: 'kg', basis: '50' }])
  expect(sent).toEqual([expect.objectContaining({ unit: 'kg', basis: '50' })])
  wrapper.unmount()
})

test('pieces keep the numbers after a dialog that says so, with the basis of 1', async () => {
  const { wrapper, sent, previews } = await openOats({
    'POST /api/ingredients/7/unit-change': (body) => {
      previews.push(body)
      return { body: unitChange({ kind: 'no_convert', factor: null, counts: { basis: 1, recipe_amounts: 4 } }) }
    },
  })
  await chooseUnit(wrapper, 'Measured in', 'st (piece)')
  expect(value(wrapper, 'Value basis')).toBe('1')
  await click(button(wrapper, 'Save'))
  expect(dialog().text).toContain('Oats: the basis and 4 recipe amounts keep their numbers.')
  await dialog().click('Change unit')
  expect(sent).toEqual([expect.objectContaining({ unit: 'st', basis: '1' })])
  expect(previews).toEqual([{ unit: 'st', basis: '1' }])
  wrapper.unmount()
})

test('another spelling of the same unit saves with no dialog', async () => {
  const { wrapper, sent } = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'same', factor: null }) },
  })
  await field(wrapper, 'Measured in').setValue('gram')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([expect.objectContaining({ unit: 'gram', basis: '100' })])
  expect(document.querySelector('.q-dialog')).toBeNull()
  wrapper.unmount()
})

test('a refusal shows under the unit field with no dialog and no save', async () => {
  const refusal = unitChangeRefusal({
    type: 'conversion_rounds_to_zero', kind: 'recipe_amount', name: 'Porridge', field: 'amount',
    number: '0.0004', converted: '0',
  })
  const { wrapper, sent, router } = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ refusal }) },
  })
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('The amount in Porridge (0.0004 g) would round to 0 in kg. Use a smaller unit.')
  expect(document.querySelector('.q-dialog')).toBeNull()
  expect(sent).toEqual([])
  expect(router.currentRoute.value.fullPath).toBe('/ingredients/7')
  wrapper.unmount()
})

test('an energy unit is refused by the preview with the form text, before any save', async () => {
  const { wrapper, sent } = await openOats({
    'POST /api/ingredients/7/unit-change': {
      body: unitChange({ kind: 'no_convert', factor: null, refusal: unitChangeRefusal({ type: 'unit_not_for_ingredient' }) }),
    },
  })
  await field(wrapper, 'Measured in').setValue('kcal')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('An ingredient is measured in an amount of food, such as g, dl or pieces.')
  expect(sent).toEqual([])
  wrapper.unmount()
})

test('a save refused after the preview shows the same text for an energy unit, or the server sentence', async () => {
  const { wrapper } = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'no_convert', factor: null }) },
    'PUT /api/ingredients/7': {
      status: 422,
      body: { detail: [{ loc: ['body', 'unit'], type: 'unit_not_for_ingredient', msg: 'x' }] },
    },
  })
  await field(wrapper, 'Measured in').setValue('kcal')
  await click(button(wrapper, 'Save'))
  await dialog().click('Change unit')
  expect(wrapper.text()).toContain('An ingredient is measured in an amount of food, such as g, dl or pieces.')
  wrapper.unmount()

  const second = await openOats({
    'PUT /api/ingredients/7': {
      status: 422,
      body: { detail: [{ loc: ['body', 'unit'], type: 'conversion_too_large', msg: 'Oats, basis: too large' }] },
    },
  })
  await chooseUnit(second.wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(second.wrapper, 'Save'))
  await dialog().click('Convert')
  expect(second.wrapper.text()).toContain('Oats, basis: too large')
  second.wrapper.unmount()
})

test('digits that will be rounded are said in the dialog', async () => {
  const { wrapper } = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ ...basisChange, rounded: 2 }) },
  })
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  expect(dialog().text).toContain('2 values will be rounded.')
  wrapper.unmount()
})

test('a preview that fails saves nothing and says so', async () => {
  const { wrapper, sent } = await openOats({ 'POST /api/ingredients/7/unit-change': 500 })
  await chooseUnit(wrapper, 'Measured in', 'kg (kilogram)')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('Could not save')
  expect(sent).toEqual([])
  wrapper.unmount()
})

test('a new ingredient and an unchanged unit never ask', async () => {
  const created = recorder(201, (body) => ({ ...body, id: 8, recipe_count: 0 }))
  const fresh = await mountPage('/ingredients/new', { 'POST /api/ingredients': created.handler })
  await field(fresh.wrapper, 'Name').setValue('Egg')
  await field(fresh.wrapper, 'Measured in').setValue('st')
  await click(button(fresh.wrapper, 'Save'))
  expect(fresh.calls.filter((call) => call.includes('unit-change'))).toEqual([])
  fresh.wrapper.unmount()

  const { wrapper, calls } = await openOats()
  await field(wrapper, 'Name').setValue('Rolled oats')
  await click(button(wrapper, 'Save'))
  expect(calls.filter((call) => call.includes('unit-change'))).toEqual([])
  wrapper.unmount()
})

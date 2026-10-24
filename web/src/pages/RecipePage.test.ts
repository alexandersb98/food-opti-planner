import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { button, click, dialog, fakeServer, field, mountApp, texts, type FakeServer } from '../test-app'
import { attribute, ingredient, recipe, tag } from '../test-data'

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 })
const vegan = tag({ id: 1, name: 'vegan' })
const quick = tag({ id: 2, name: 'quick' })
const nuts = tag({ id: 3, name: 'contains-nuts', derive: 'any' })
const oats = ingredient({
  id: 1,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
  tag_ids: [1],
})
const milk = ingredient({ id: 2, name: 'Milk', unit: 'ml', values: [{ attribute_id: 1, value: '64' }] })
const almonds = ingredient({ id: 3, name: 'Almonds', values: [{ attribute_id: 2, value: '21' }], tag_ids: [1, 3] })
const porridge = recipe({
  id: 7,
  name: 'Porridge',
  items: [
    { ingredient_id: 1, amount: '60' },
    { ingredient_id: 2, amount: '200' },
  ],
  extra_tag_ids: [2],
  derived_tag_ids: [],
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(path: string, server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/attributes': { body: [energy, protein] },
    'GET /api/tags': { body: [vegan, quick, nuts] },
    'GET /api/ingredients': { body: [oats, milk, almonds] },
    'GET /api/recipes/7': { body: porridge },
    'GET /api/recipes': { body: [] },
    ...server,
  })
  const { wrapper, router } = await mountApp(path)
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function value(wrapper: Wrapper, label: string) {
  return field(wrapper, label).element.value
}

/** The whole field around the input labelled `label`, with its error. */
function labelled(wrapper: Wrapper, label: string) {
  const found = wrapper.findAll('.q-field').find((f) => f.find(`input[aria-label="${label}"]`).exists())
  expect(found, `field ${label}`).toBeDefined()
  return found!
}

function items(wrapper: Wrapper) {
  return wrapper.findAll('.recipe-item').map((row) => [row.find('.item-name').text(), row.find('input').element.value])
}

function totals(wrapper: Wrapper) {
  return texts(wrapper, '.portion-total')
}

function derivedTags(wrapper: Wrapper) {
  return texts(wrapper, '.derived-tags .q-chip')
}

function extraTags(wrapper: Wrapper) {
  return texts(wrapper, '.extra-tags .q-chip').map((text) => text.replace('cancel', '').trim())
}

/** Pick an ingredient in the "+ Add ingredient" picker, after searching. */
async function pickIngredient(wrapper: Wrapper, search: string, name: string) {
  await click(button(wrapper, '+ Add ingredient'))
  const input = document.querySelector<HTMLInputElement>('.q-dialog input')!
  input.value = search
  input.dispatchEvent(new Event('input'))
  await flushPromises()
  const rows = [...document.querySelectorAll<HTMLElement>('.q-dialog .picker-row')]
  const row = rows.find((r) => r.textContent?.includes(name))
  expect(row, `picker row ${name}`).toBeDefined()
  row!.click()
  await flushPromises()
}

/** A request's body, recorded, and the reply. */
function recorder(status: number, reply: (body: object) => object) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: reply(body as object) }
  }
  return { sent, handler }
}

test('a recipe opens with its ingredients, totals per portion, tags and portion size', async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: { ...porridge, derived_tag_ids: [1] } },
  })
  expect(wrapper.get('h1').text()).toBe('Edit recipe')
  expect(value(wrapper, 'Name')).toBe('Porridge')
  expect(items(wrapper)).toEqual([
    ['Oats', '60'],
    ['Milk', '200'],
  ])
  expect(wrapper.text()).toContain('ml')
  expect(totals(wrapper)).toEqual(['Energy 361 kcal', 'Protein 10.1 g'])
  expect(derivedTags(wrapper)).toEqual(['vegan'])
  expect(extraTags(wrapper)).toEqual(['quick'])
  expect(labelled(wrapper, 'From').find('input').element.value).toBe('0.5')
  expect(labelled(wrapper, 'To').find('input').element.value).toBe('2')
  expect(wrapper.text()).not.toContain('Step')
  wrapper.unmount()
})

test('totals follow the amounts as they are typed', async () => {
  const { wrapper } = await mountPage('/recipes/7')
  await field(wrapper, 'Amount of Oats').setValue('100')
  expect(totals(wrapper)).toEqual(['Energy 517 kcal', 'Protein 16.9 g'])
  await field(wrapper, 'Amount of Milk').setValue('0,5')
  expect(totals(wrapper)).toEqual(['Energy 389 kcal', 'Protein 16.9 g'])
  await field(wrapper, 'Amount of Milk').setValue('a lot')
  expect(totals(wrapper)).toEqual(['Energy 389 kcal', 'Protein 16.9 g'])
  wrapper.unmount()
})

test('ingredients are added from a searchable picker and removed, and the server gives the derived tags', async () => {
  const derived = recorder(200, (body) => ((body as { ingredient_ids: number[] }).ingredient_ids.includes(3) ? [1, 3] : [1]))
  const { wrapper } = await mountPage('/recipes/7', { 'POST /api/recipes/derived-tags': derived.handler })
  await pickIngredient(wrapper, 'alm', 'Almonds')
  expect(items(wrapper)).toEqual([
    ['Oats', '60'],
    ['Milk', '200'],
    ['Almonds', ''],
  ])
  expect(derived.sent).toEqual([{ ingredient_ids: [1, 2, 3] }])
  expect(derivedTags(wrapper)).toEqual(['vegan', 'contains-nuts'])

  // Back to the stored ingredients, whose tags came with the recipe.
  await click(wrapper.get('[aria-label="Remove Almonds"]'))
  expect(derived.sent).toHaveLength(1)
  expect(derivedTags(wrapper)).toEqual([])
  await click(wrapper.get('[aria-label="Remove Milk"]'))
  expect(items(wrapper)).toEqual([['Oats', '60']])
  expect(derived.sent).toEqual([{ ingredient_ids: [1, 2, 3] }, { ingredient_ids: [1] }])
  expect(derivedTags(wrapper)).toEqual(['vegan'])
  wrapper.unmount()
})

test('the picker leaves out the ingredients already in the recipe', async () => {
  const { wrapper } = await mountPage('/recipes/7')
  await click(button(wrapper, '+ Add ingredient'))
  const rows = [...document.querySelectorAll('.q-dialog .picker-row')].map((r) => r.textContent)
  expect(rows).toEqual([expect.stringContaining('Almonds')])
  document.querySelector<HTMLElement>('.q-dialog .picker-row')!.click()
  await flushPromises()
  await click(button(wrapper, '+ Add ingredient'))
  expect(dialog().text).toContain('Every ingredient is in the recipe already.')
  wrapper.unmount()
})

test('clearing the picker search box brings every ingredient back', async () => {
  const { wrapper } = await mountPage('/recipes/new')
  await click(button(wrapper, '+ Add ingredient'))
  const pickerRows = () => [...document.querySelectorAll('.q-dialog .picker-row')].map((r) => r.textContent)
  const input = document.querySelector<HTMLInputElement>('.q-dialog input')!
  input.value = 'Oat'
  input.dispatchEvent(new Event('input'))
  await flushPromises()
  expect(pickerRows()).toEqual([expect.stringContaining('Oats')])
  document.querySelector<HTMLElement>('.q-dialog [aria-label="Clear"]')!.click()
  await flushPromises()
  expect(pickerRows()).toEqual([
    expect.stringContaining('Almonds'),
    expect.stringContaining('Milk'),
    expect.stringContaining('Oats'),
  ])
  wrapper.unmount()
})

test('tags are added from the ones the recipe lacks, and removed', async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: { ...porridge, derived_tag_ids: [1] } },
  })
  await click(button(wrapper, '+ Add tag'))
  const offered = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')]
  expect(offered.map((item) => item.textContent)).toEqual(['contains-nuts'])
  offered[0]!.click()
  await flushPromises()
  expect(extraTags(wrapper)).toEqual(['quick', 'contains-nuts'])
  await click(wrapper.get('.extra-tags [aria-label="Remove quick"]'))
  expect(extraTags(wrapper)).toEqual(['contains-nuts'])
  wrapper.unmount()
})

test('Save sends the fields and returns to the list', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...porridge, ...body }))
  const { wrapper, router } = await mountPage('/recipes/7', { 'PUT /api/recipes/7': handler })
  await field(wrapper, 'Name').setValue('Milk porridge')
  await field(wrapper, 'Amount of Milk').setValue(' 250,5 ')
  await labelled(wrapper, 'From').find('input').setValue('1')
  await labelled(wrapper, 'To').find('input').setValue('3')
  await click(button(wrapper, 'In steps'))
  await labelled(wrapper, 'Step').find('input').setValue('0.5')
  await click(wrapper.get('.q-expansion-item .q-item'))
  await labelled(wrapper, 'Never more than').find('input').setValue('4')
  await labelled(wrapper, 'Over-size penalty').find('input').setValue('2.5')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    {
      name: 'Milk porridge',
      items: [
        { ingredient_id: 1, amount: '60' },
        { ingredient_id: 2, amount: '250.5' },
      ],
      extra_tag_ids: [2],
      min_multiplier: '1',
      max_multiplier: '3',
      step: '0.5',
      hard_max_multiplier: '4',
      serving_cap_weight: '2.5',
    },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/recipes')
  wrapper.unmount()
})

test('a new recipe starts with the default portion size', async () => {
  const { sent, handler } = recorder(201, (body) => ({ ...porridge, ...body, id: 8 }))
  const derived = { 'POST /api/recipes/derived-tags': { body: [1] } }
  const { wrapper, router } = await mountPage('/recipes/new', { 'POST /api/recipes': handler, ...derived })
  expect(wrapper.get('h1').text()).toBe('New recipe')
  expect(items(wrapper)).toEqual([])
  expect(totals(wrapper)).toEqual(['Energy 0 kcal', 'Protein 0 g'])
  expect(wrapper.text()).not.toContain('Delete')
  await field(wrapper, 'Name').setValue('Oatmeal')
  await pickIngredient(wrapper, '', 'Oats')
  await field(wrapper, 'Amount of Oats').setValue('80')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    {
      name: 'Oatmeal',
      items: [{ ingredient_id: 1, amount: '80' }],
      extra_tag_ids: [],
      min_multiplier: '0.5',
      max_multiplier: '2',
      step: null,
      hard_max_multiplier: null,
      serving_cap_weight: '1',
    },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/recipes')
  wrapper.unmount()
})

test('wrong fields are marked and nothing is sent', async () => {
  const { wrapper, calls } = await mountPage('/recipes/new')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('Enter a name.')
  expect(wrapper.text()).toContain('Add at least one ingredient.')

  await pickIngredient(wrapper, '', 'Oats')
  await field(wrapper, 'Amount of Oats').setValue('0')
  await labelled(wrapper, 'From').find('input').setValue('0.0005')
  await labelled(wrapper, 'To').find('input').setValue('abc')
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('Enter an amount above 0.')
  expect(labelled(wrapper, 'From').text()).toContain('Enter a number above 0, with at most 3 decimals.')
  expect(labelled(wrapper, 'To').text()).toContain('Enter a number above 0, with at most 3 decimals.')
  expect(calls).not.toContain('POST /api/recipes')
  wrapper.unmount()
})

test('the portion size follows the library rules across fields', async () => {
  const { wrapper, calls } = await mountPage('/recipes/7')
  await labelled(wrapper, 'From').find('input').setValue('1')
  await labelled(wrapper, 'To').find('input').setValue('0.75')
  await click(button(wrapper, 'In steps'))
  await labelled(wrapper, 'Step').find('input').setValue('0.3')
  await click(button(wrapper, 'Save'))
  expect(labelled(wrapper, 'From').text()).toContain('Must be a whole number of steps.')
  expect(labelled(wrapper, 'To').text()).toContain('Must be at least From.')

  await labelled(wrapper, 'To').find('input').setValue('2')
  await labelled(wrapper, 'Step').find('input').setValue('0.25')
  await click(wrapper.get('.q-expansion-item .q-item'))
  expect(labelled(wrapper, 'Never more than').text()).toContain('Empty: 3 × To, which is 6 ×.')
  await labelled(wrapper, 'Never more than').find('input').setValue('1.5')
  await labelled(wrapper, 'Over-size penalty').find('input').setValue('-1')
  await click(button(wrapper, 'Save'))
  expect(labelled(wrapper, 'From').text()).not.toContain('steps')
  expect(labelled(wrapper, 'Never more than').text()).toContain('Must be at least To.')
  expect(labelled(wrapper, 'Over-size penalty').text()).toContain('Enter a number, 0 or more.')
  expect(calls).not.toContain('PUT /api/recipes/7')
  wrapper.unmount()
})

test('a name in use, and portion sizes the server refuses, are shown on their fields', async () => {
  const { wrapper, router } = await mountPage('/recipes/7', {
    'PUT /api/recipes/7': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('A recipe with this name already exists.')
  expect(router.currentRoute.value.fullPath).toBe('/recipes/7')

  fakeServer({
    'PUT /api/recipes/7': {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'max_multiplier'], type: 'below_min', msg: 'low' },
          { loc: ['body', 'items', 1, 'amount'], type: 'decimal_max_digits', msg: 'long' },
        ],
      },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(labelled(wrapper, 'To').text()).toContain('Must be at least From.')
  const milkRow = wrapper.findAll('.recipe-item')[1]!
  expect(milkRow.text()).toContain('Use at most 9 digits before the point and 6 after.')
  wrapper.unmount()
})

test('any other failed save says so', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'PUT /api/recipes/7': 500 })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  wrapper.unmount()
})

test('delete asks first, then deletes and returns to the list', async () => {
  const { wrapper, router, calls } = await mountPage('/recipes/7', { 'DELETE /api/recipes/7': 204 })
  await click(button(wrapper, 'Delete'))
  expect(dialog().text).toContain('Delete Porridge?')
  expect(calls).not.toContain('DELETE /api/recipes/7')
  await dialog().click('Delete')
  expect(calls).toContain('DELETE /api/recipes/7')
  expect(router.currentRoute.value.fullPath).toBe('/recipes')
  wrapper.unmount()
})

test('an unknown recipe fails to load', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': 404 })
  expect(wrapper.text()).toContain('Could not load the recipe.')
  wrapper.unmount()
})

test('back leaves without saving', async () => {
  const { wrapper, router, calls } = await mountPage('/recipes/7')
  await field(wrapper, 'Name').setValue('Changed')
  await click(wrapper.get('[aria-label="Back"]'))
  expect(router.currentRoute.value.fullPath).toBe('/recipes')
  expect(calls).not.toContain('PUT /api/recipes/7')
  wrapper.unmount()
})

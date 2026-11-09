import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { button, click, dialog, fakeServer, field, mountApp, settleMenu, texts, unitRoutes, type FakeServer } from '../test-app'
import { attribute, conversion, ingredient, lines, recipe, tag } from '../test-data'
import { resetUnits } from '../units'

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
  sections: lines([1, '60'], [2, '200']),
  extra_tag_ids: [2],
  derived_tag_ids: [],
})

afterEach(() => {
  resetUnits()
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
    ...unitRoutes(),
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

/** The tags that are on, each with whether it comes from the ingredients. */
function tagsOn(wrapper: Wrapper) {
  return wrapper
    .findAll('.tag-choice')
    .filter((tag) => tag.attributes('aria-pressed') === 'true')
    .map((tag) => [tag.text().replace('check', '').trim(), tag.attributes('disabled') !== undefined])
}

/** The tags from the ingredients. */
function derivedTags(wrapper: Wrapper) {
  return tagsOn(wrapper)
    .filter(([, derived]) => derived)
    .map(([name]) => name)
}

function tagButton(wrapper: Wrapper, name: string) {
  const found = wrapper.findAll('.tag-choice').find((tag) => tag.text().replace('check', '').trim() === name)
  expect(found, `tag ${name}`).toBeDefined()
  return found!
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
  expect(tagsOn(wrapper)).toEqual([
    ['vegan', true],
    ['quick', false],
  ])
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

test('the same ingredient can be added on a second line and the picker still offers it', async () => {
  const { wrapper } = await mountPage('/recipes/7')
  await click(button(wrapper, '+ Add ingredient'))
  const rows = [...document.querySelectorAll('.q-dialog .picker-row')].map((r) => r.textContent)
  expect(rows).toEqual([
    expect.stringContaining('Almonds'),
    expect.stringContaining('Milk'),
    expect.stringContaining('Oats'),
  ])
  document.querySelector<HTMLElement>('.q-dialog .picker-row:last-child')!.click()
  await flushPromises()
  expect(items(wrapper)).toEqual([
    ['Oats', '60'],
    ['Milk', '200'],
    ['Oats', ''],
  ])
  expect(totals(wrapper)).toEqual(['Energy 361 kcal', 'Protein 10.1 g'])
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

test('tags are turned on and off by hand, except the ones from the ingredients', async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: { ...porridge, derived_tag_ids: [1] } },
  })
  await click(tagButton(wrapper, 'contains-nuts'))
  await click(tagButton(wrapper, 'quick'))
  expect(tagsOn(wrapper)).toEqual([
    ['vegan', true],
    ['contains-nuts', false],
  ])
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
      servings: 1,
      sections: [
        {
          name: '',
          items: [
            { ingredient_id: 1, amount: '60', unit: '', original_text: '' },
            { ingredient_id: 2, amount: '250.5', unit: '', original_text: '' },
          ],
        },
      ],
      instructions: '',
      source_url: '',
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

test('a new recipe starts with one unnamed section, servings 1 and the default portion size', async () => {
  const { sent, handler } = recorder(201, (body) => ({ ...porridge, ...body, id: 8 }))
  const derived = { 'POST /api/recipes/derived-tags': { body: [1] } }
  const { wrapper, router } = await mountPage('/recipes/new', { 'POST /api/recipes': handler, ...derived })
  expect(wrapper.get('h1').text()).toBe('New recipe')
  expect(items(wrapper)).toEqual([])
  expect(value(wrapper, 'Serves')).toBe('1')
  expect(wrapper.findAll('.section-name')).toHaveLength(0)
  expect(totals(wrapper)).toEqual(['Energy 0 kcal', 'Protein 0 g'])
  expect(wrapper.text()).not.toContain('Delete')
  await field(wrapper, 'Name').setValue('Oatmeal')
  await pickIngredient(wrapper, '', 'Oats')
  await field(wrapper, 'Amount of Oats').setValue('80')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    {
      name: 'Oatmeal',
      servings: 1,
      sections: [{ name: '', items: [{ ingredient_id: 1, amount: '80', unit: '', original_text: '' }] }],
      instructions: '',
      source_url: '',
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
  expect(wrapper.text()).not.toContain('Enter a whole number from 1 to 1000.')

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
          { loc: ['body', 'sections', 0, 'items', 1, 'amount'], type: 'decimal_max_digits', msg: 'long' },
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

test('the advanced settings open on a mistake in them, found here or by the server', async () => {
  const advancedOpen = (wrapper: Wrapper) => wrapper.get('.q-expansion-item').classes('q-expansion-item--expanded')
  const { wrapper, calls } = await mountPage('/recipes/7', {
    'PUT /api/recipes/7': {
      status: 422,
      body: { detail: [{ loc: ['body', 'serving_cap_weight'], type: 'decimal_max_digits', msg: 'long' }] },
    },
  })
  expect(advancedOpen(wrapper)).toBe(false)
  await labelled(wrapper, 'Never more than').find('input').setValue('1')
  await click(button(wrapper, 'Save'))
  expect(advancedOpen(wrapper)).toBe(true)
  expect(calls).not.toContain('PUT /api/recipes/7')

  await labelled(wrapper, 'Never more than').find('input').setValue('')
  await click(wrapper.get('.q-expansion-item .q-item'))
  expect(advancedOpen(wrapper)).toBe(false)
  await click(button(wrapper, 'Save'))
  expect(calls).toContain('PUT /api/recipes/7')
  expect(advancedOpen(wrapper)).toBe(true)
  expect(labelled(wrapper, 'Over-size penalty').text()).toContain('Use at most 9 digits before the point and 6 after.')
  wrapper.unmount()
})

test('a failed delete says so and closes the dialog', async () => {
  const { wrapper, router } = await mountPage('/recipes/7', { 'DELETE /api/recipes/7': 500 })
  await click(button(wrapper, 'Delete'))
  await dialog().click('Delete')
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not delete. Try again.')
  expect(document.querySelector('.q-dialog button')).toBeNull()
  expect(router.currentRoute.value.fullPath).toBe('/recipes/7')
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

// Servings, sections, instructions and source

const layered = recipe({
  id: 7,
  name: 'Layered',
  servings: 4,
  instructions: 'Bake.',
  source_url: 'https://example.com/layered',
  sections: [
    { name: 'Base', items: [{ ingredient_id: 1, amount: '200', unit: '', original_text: '200 g oats' }] },
    { name: 'Topping', items: [{ ingredient_id: 3, amount: '40', unit: '', original_text: '' }] },
  ],
})

function sectionNames(wrapper: Wrapper) {
  return wrapper.findAll<HTMLInputElement>('.section-name input').map((input) => input.element.value)
}

test('a recipe opens with its sections, servings, instructions and source, the totals divided', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: layered } })
  expect(value(wrapper, 'Serves')).toBe('4')
  expect(wrapper.text()).toContain('Ingredients, for 4 portions')
  expect(sectionNames(wrapper)).toEqual(['Base', 'Topping'])
  expect(items(wrapper)).toEqual([
    ['Oats', '200'],
    ['Almonds', '40'],
  ])
  // 200 g oats is 778 kcal and 33.8 g protein; 40 g almonds 8.4 g protein; over 4 portions.
  expect(totals(wrapper)).toEqual(['Energy 195 kcal', 'Protein 10.6 g'])
  expect(wrapper.get('textarea').element.value).toBe('Bake.')
  expect(value(wrapper, 'Source')).toBe('https://example.com/layered')
  wrapper.unmount()
})

test('Serves N divides the per-portion totals as typed and the heading says for N portions', async () => {
  const { wrapper } = await mountPage('/recipes/7')
  expect(wrapper.text()).toContain('Ingredients, for 1 portion')
  expect(wrapper.text()).not.toContain('Ingredients, for 1 portions')
  await field(wrapper, 'Serves').setValue('2')
  expect(wrapper.text()).toContain('Ingredients, for 2 portions')
  expect(totals(wrapper)).toEqual(['Energy 181 kcal', 'Protein 5.1 g'])
  await field(wrapper, 'Serves').setValue('x')
  expect(wrapper.text()).toContain('Ingredients, for 1 portion')
  expect(totals(wrapper)).toEqual(['Energy 361 kcal', 'Protein 10.1 g'])
  wrapper.unmount()
})

test('+ Add section shows name fields, saving without a name is refused on the field', async () => {
  const { wrapper, calls } = await mountPage('/recipes/7')
  expect(sectionNames(wrapper)).toEqual([])
  await click(button(wrapper, '+ Add section'))
  expect(sectionNames(wrapper)).toEqual(['', ''])
  await click(button(wrapper, 'Save'))
  expect(wrapper.findAll('.section-name').map((f) => f.text().includes('Name every section.'))).toEqual([true, true])
  expect(calls).not.toContain('PUT /api/recipes/7')
  wrapper.unmount()
})

test('a line moves to another section', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: layered } })
  await click(wrapper.get('[aria-label="Line menu for Oats"]'))
  const entries = [...document.querySelectorAll<HTMLElement>('.q-menu .move-to')]
  expect(entries.map((e) => e.textContent?.trim())).toEqual(['Move to Topping'])
  entries[0]!.click()
  await flushPromises()
  const rows = wrapper.findAll('.recipe-section').map((section) => section.findAll('.recipe-item').map((r) => r.find('.item-name').text()))
  expect(rows).toEqual([[], ['Almonds', 'Oats']])
  wrapper.unmount()
})

test('removing a section moves its lines up and keeps every line', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: layered } })
  await click(wrapper.findAll('button').filter((b) => b.text() === 'Remove section')[1]!)
  // The heading of the section it joined stays; the lines are all still there.
  expect(sectionNames(wrapper)).toEqual(['Base'])
  expect(items(wrapper)).toEqual([
    ['Oats', '200'],
    ['Almonds', '40'],
  ])
  expect(wrapper.findAll('.recipe-section')).toHaveLength(1)
  expect(wrapper.findAll('button').filter((b) => b.text() === 'Remove section')).toHaveLength(0)
  wrapper.unmount()
})

test('Save sends sections, servings, instructions and source, the link trimmed', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...layered, ...body }))
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: layered }, 'PUT /api/recipes/7': handler })
  await field(wrapper, 'Serves').setValue('6')
  await wrapper.get('textarea').setValue('Bake.\nCool.')
  await field(wrapper, 'Source').setValue(' https://example.com/new ')
  await click(button(wrapper, 'Save'))
  expect(sent).toMatchObject([
    {
      servings: 6,
      sections: [
        { name: 'Base', items: [{ ingredient_id: 1, amount: '200', unit: '', original_text: '200 g oats' }] },
        { name: 'Topping', items: [{ ingredient_id: 3, amount: '40', unit: '', original_text: '' }] },
      ],
      instructions: 'Bake.\nCool.',
      source_url: 'https://example.com/new',
    },
  ])
  wrapper.unmount()
})

test('an invalid source and servings are marked and nothing is sent', async () => {
  const { wrapper, calls } = await mountPage('/recipes/7')
  await field(wrapper, 'Serves').setValue('0')
  await field(wrapper, 'Source').setValue('example.com')
  await click(button(wrapper, 'Save'))
  expect(labelled(wrapper, 'Serves').text()).toContain('Enter a whole number from 1 to 1000.')
  expect(wrapper.text()).toContain('Enter a link that starts with http:// or https://.')
  expect(calls).not.toContain('PUT /api/recipes/7')
  wrapper.unmount()
})

test("the server's section, servings and link errors show on their fields", async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: layered },
    'PUT /api/recipes/7': {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'servings'], type: 'less_than_equal', msg: 'big' },
          { loc: ['body', 'source_url'], type: 'invalid_url', msg: 'url' },
          { loc: ['body', 'sections', 1, 'name'], type: 'name_required', msg: 'name' },
          { loc: ['body', 'sections', 1, 'items', 0, 'amount'], type: 'decimal_max_digits', msg: 'long' },
        ],
      },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(labelled(wrapper, 'Serves').text()).toContain('Enter a whole number from 1 to 1000.')
  expect(wrapper.text()).toContain('Enter a link that starts with http:// or https://.')
  expect(wrapper.findAll('.section-name')[1]!.text()).toContain('Name every section.')
  expect(wrapper.findAll('.recipe-item')[1]!.text()).toContain('Use at most 9 digits before the point and 6 after.')
  wrapper.unmount()
})

test('an ingredient that no longer exists is reported on save', async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'PUT /api/recipes/7': {
      status: 422,
      body: { detail: [{ loc: ['body', 'sections', 0, 'items', 1, 'ingredient_id'], type: 'unknown_ingredient', msg: 'x' }] },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('[role="alert"]').text()).toBe('An ingredient of this recipe no longer exists. Remove it and save again.')
  wrapper.unmount()
})

test('Open source links only a valid link', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: layered } })
  const link = wrapper.get('a.source-link')
  expect([link.text(), link.attributes('href'), link.attributes('target'), link.attributes('rel')]).toEqual([
    'Open source',
    'https://example.com/layered',
    '_blank',
    'noopener noreferrer',
  ])
  await field(wrapper, 'Source').setValue('javascript:alert(1)')
  expect(wrapper.find('a.source-link').exists()).toBe(false)
  await field(wrapper, 'Source').setValue('')
  expect(wrapper.find('a.source-link').exists()).toBe(false)
  wrapper.unmount()
})

test('the picker adds to the section whose button was pressed', async () => {
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: layered } })
  await click(wrapper.findAll('button').filter((b) => b.text() === '+ Add ingredient')[1]!)
  const row = [...document.querySelectorAll<HTMLElement>('.q-dialog .picker-row')].find((r) => r.textContent?.includes('Milk'))!
  row.click()
  await flushPromises()
  const rows = wrapper.findAll('.recipe-section').map((section) => section.findAll('.recipe-item').map((r) => r.find('.item-name').text()))
  expect(rows).toEqual([['Oats'], ['Almonds', 'Milk']])
  wrapper.unmount()
})


// Line units.

const dl40 = conversion({ id: 1, unit: 'dl', factor: '40' })
const oatsWithDl = { ...oats, conversions: [dl40] }
const sections = (items: { ingredient_id: number; amount: string; unit: string }[]) => [
  { name: '', items: items.map((item) => ({ ...item, original_text: '' })) },
]
const dlRecipe = recipe({
  id: 7,
  name: 'Porridge',
  sections: sections([
    { ingredient_id: 1, amount: '60', unit: '' },
    { ingredient_id: 1, amount: '1', unit: 'dl' },
  ]),
})

/** Open the unit picker of the line labelled `label` (the first match) and choose `option`. */
async function chooseLineUnit(wrapper: Wrapper, label: string, option: string, index = 0) {
  const input = wrapper.findAll<HTMLInputElement>(`input[aria-label="${label}"]`)[index]!
  input.element.closest('.q-field__control')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await settleMenu()
  const row = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')].find((r) => r.textContent?.trim() === option)
  expect(row, `unit ${option}`).toBeDefined()
  row!.click()
  await settleMenu()
}

const unitBoxes = (wrapper: Wrapper) => wrapper.findAll('.line-unit .q-field__native').map((box) => box.text())

test('a line in dl of a g ingredient with a dl conversion converts in the per-portion total', async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: dlRecipe },
    'GET /api/ingredients': { body: [oatsWithDl, milk, almonds] },
  })
  // 60 g and 1 dl of 40 g per dl: 100 g of oats.
  expect(totals(wrapper)).toEqual(['Energy 389 kcal', 'Protein 16.9 g'])
  expect(unitBoxes(wrapper)).toEqual(['g', 'dl'])
  wrapper.unmount()
})

test('an existing recipe opens with its line units', async () => {
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: dlRecipe },
    'GET /api/ingredients': { body: [oatsWithDl, milk, almonds] },
  })
  expect(unitBoxes(wrapper)).toEqual(['g', 'dl'])
  expect(wrapper.find('.unit-error').exists()).toBe(false)
  wrapper.unmount()
})

test('choosing a catalogue unit on a line changes the total', async () => {
  const { wrapper } = await mountPage('/recipes/7')
  await chooseLineUnit(wrapper, 'Unit of Oats', 'kg (kilogram)')
  expect(unitBoxes(wrapper)).toEqual(['kg', 'ml'])
  // 60 kg of oats (233400 kcal) and 200 ml of milk (128 kcal).
  expect(totals(wrapper)).toEqual(['Energy 233528 kcal', 'Protein 10140 g'])
  wrapper.unmount()
})

test('New unit… adds a conversion through the API, selects it on the line and updates the total', async () => {
  const posted = recorder(201, () => conversion({ id: 5, unit: 'dl', factor: '40' }))
  const { wrapper } = await mountPage('/recipes/new', { 'POST /api/ingredients/1/conversions': posted.handler })
  await pickIngredient(wrapper, '', 'Oats')
  await field(wrapper, 'Amount of Oats').setValue('1')
  await chooseLineUnit(wrapper, 'Unit of Oats', 'New unit…')
  const open = dialog()
  expect(open.text).toContain('New unit')
  const unit = document.querySelector<HTMLInputElement>('.conversion-dialog input[aria-label="Unit"]')!
  unit.value = 'dl'
  unit.dispatchEvent(new Event('input', { bubbles: true }))
  const factor = document.querySelector<HTMLInputElement>('.conversion-dialog input[aria-label="How many g one makes"]')!
  factor.value = '40'
  factor.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  await open.click('Save')
  expect(posted.sent).toEqual([{ unit: 'dl', factor: '40' }])
  expect(unitBoxes(wrapper)).toEqual(['dl'])
  // 1 dl of 40 g per dl: 40 g of oats, 155.6 kcal.
  expect(totals(wrapper)).toEqual(['Energy 156 kcal', 'Protein 6.8 g'])
  wrapper.unmount()
})

test('a line that does not convert is marked and Save sends nothing', async () => {
  const stale = recipe({
    id: 7,
    name: 'Porridge',
    sections: sections([{ ingredient_id: 1, amount: '1', unit: 'dl' }]),
  })
  const put = recorder(200, () => stale)
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/recipes/7': { body: stale }, 'PUT /api/recipes/7': put.handler })
  expect(totals(wrapper)).toEqual(['Energy 0 kcal', 'Protein 0 g'])
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('.unit-error').text()).toBe("dl of Oats doesn't convert. Pick another unit or add a conversion.")
  expect(put.sent).toEqual([])
  wrapper.unmount()
})

test("Save sends each line's unit", async () => {
  const put = recorder(200, (body) => ({ ...dlRecipe, ...body }))
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: dlRecipe },
    'GET /api/ingredients': { body: [oatsWithDl, milk, almonds] },
    'PUT /api/recipes/7': put.handler,
  })
  await click(button(wrapper, 'Save'))
  const [sent] = put.sent as { sections: { items: { unit: string }[] }[] }[]
  expect(sent!.sections[0]!.items.map((item) => item.unit)).toEqual(['', 'dl'])
  wrapper.unmount()
})

test("the server's unit_not_convertible shows on the line", async () => {
  const withOz = recipe({
    id: 7,
    name: 'Porridge',
    sections: sections([{ ingredient_id: 1, amount: '2', unit: 'oz' }]),
  })
  const { wrapper } = await mountPage('/recipes/7', {
    'GET /api/recipes/7': { body: withOz },
    'PUT /api/recipes/7': {
      status: 422,
      body: { detail: [{ loc: ['body', 'sections', 0, 'items', 0, 'unit'], type: 'unit_not_convertible', msg: 'x' }] },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('.unit-error').text()).toContain("oz of Oats doesn't convert")
  wrapper.unmount()
})

test('with the catalogue not loaded the page still works for own-unit lines', async () => {
  const put = recorder(200, (body) => ({ ...porridge, ...body }))
  const { wrapper } = await mountPage('/recipes/7', { 'GET /api/units': 500, 'PUT /api/recipes/7': put.handler })
  expect(totals(wrapper)).toEqual(['Energy 361 kcal', 'Protein 10.1 g'])
  await click(button(wrapper, 'Save'))
  expect(put.sent).toHaveLength(1)
  wrapper.unmount()
})

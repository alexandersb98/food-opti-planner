import { afterEach, expect, test, vi } from 'vitest'
import { button, click, dialog, fakeServer, field, mountApp, type FakeServer } from '../test-app'
import { attribute, ingredient, tag } from '../test-data'

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
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(path: string, server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
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

  await click(button(wrapper, 'pcs'))
  expect([value(wrapper, 'Measured in'), value(wrapper, 'Value basis')]).toEqual(['pcs', '1'])
  await click(button(wrapper, 'ml'))
  expect(value(wrapper, 'Value basis')).toBe('100')
  await field(wrapper, 'Measured in').setValue('tbsp')
  expect(value(wrapper, 'Value basis')).toBe('1')

  await field(wrapper, 'Name').setValue('Egg')
  await field(wrapper, 'Measured in').setValue('pcs')
  await field(wrapper, 'Protein').setValue('6.3')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    { name: 'Egg', unit: 'pcs', basis: '1', values: [{ attribute_id: 2, value: '6.3' }], tag_ids: [] },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/ingredients')
  wrapper.unmount()
})

test('a basis changed by hand stays when the unit changes', async () => {
  const { wrapper } = await mountPage('/ingredients/new')
  await field(wrapper, 'Value basis').setValue('50')
  await click(button(wrapper, 'pcs'))
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

import { afterEach, expect, test, vi } from 'vitest'
import { button, click, fakeServer, field, mountApp, texts, type FakeServer } from '../test-app'
import { attribute, ingredient } from '../test-data'

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal', ingredient_count: 2 })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1, ingredient_count: 1 })
const oats = ingredient({
  id: 1,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
  recipe_count: 3,
})
const egg = ingredient({
  id: 2,
  name: 'egg',
  unit: 'pcs',
  basis: '1',
  values: [{ attribute_id: 1, value: '78' }],
  recipe_count: 1,
})
const milk = ingredient({ id: 3, name: 'Milk', unit: 'ml' })

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/ingredients': { body: [oats, egg, milk] },
    'GET /api/attributes': { body: [energy, protein] },
    ...server,
  })
  const { wrapper, router } = await mountApp('/ingredients')
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function rows(wrapper: Wrapper) {
  return texts(wrapper, '.ingredient-row')
}

test('ingredients are listed by name with their values per basis and their recipes', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Ingredients')
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/^egg\s*per 1 pcs · Energy 78 kcal\s*Used in 1 recipe/),
    expect.stringMatching(/^Milk\s*per 100 ml\s*Used in no recipes/),
    expect.stringMatching(/^Oats\s*per 100 g · Energy 389 kcal · Protein 16.9 g\s*Used in 3 recipes/),
  ])
  wrapper.unmount()
})

test('search narrows the list by name, ignoring case', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Search').setValue('OA')
  expect(rows(wrapper)).toEqual([expect.stringMatching(/^Oats/)])
  await field(wrapper, 'Search').setValue('xyz')
  expect(rows(wrapper)).toEqual([])
  expect(wrapper.text()).toContain('No ingredients match.')
  await click(wrapper.get('[aria-label="Clear"]'))
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/^egg/),
    expect.stringMatching(/^Milk/),
    expect.stringMatching(/^Oats/),
  ])
  wrapper.unmount()
})

test('an empty list says so', async () => {
  const { wrapper } = await mountPage({ 'GET /api/ingredients': { body: [] } })
  expect(wrapper.text()).toContain('No ingredients yet.')
  wrapper.unmount()
})

test('a row opens its editor, and the round button a new one', async () => {
  const { wrapper, router } = await mountPage({
    'GET /api/tags': { body: [] },
    'GET /api/ingredients/1': { body: oats },
  })
  await click(wrapper.findAll('.ingredient-row')[2]!)
  expect(router.currentRoute.value.fullPath).toBe('/ingredients/1')
  await router.push('/ingredients')
  await click(wrapper.get('[aria-label="New ingredient"]'))
  expect(router.currentRoute.value.fullPath).toBe('/ingredients/new')
  wrapper.unmount()
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = {
    'GET /api/session': 204,
    'GET /api/ingredients': 500,
    'GET /api/attributes': { body: [energy] },
  }
  fakeServer(server)
  const { wrapper } = await mountApp('/ingredients')
  expect(wrapper.text()).toContain('Could not load the ingredients.')
  server['GET /api/ingredients'] = { body: [milk] }
  await click(button(wrapper, 'Try again'))
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

test('Add from data source is on the page and opens the dialog', async () => {
  const { wrapper, calls } = await mountPage({
    'GET /api/data-sources': { body: [] },
    'GET /api/preferences': { body: {} },
  })
  expect(calls).not.toContain('GET /api/data-sources')
  await click(wrapper.get('.add-from-source'))
  expect(calls).toContain('GET /api/data-sources')
  expect(document.querySelector('.q-dialog')?.textContent).toContain('No data sources loaded.')
  wrapper.unmount()
})

// Updated values available: the marker and the filter.

const protein13 = { attribute_id: 2, value: '13.5', new_value: '13.8' }
const updatedOats = ingredient({ ...oats, name: 'Oats', updated_values: [protein13] })
const updatedMilk = ingredient({ ...milk, name: 'Milk', updated_values: [protein13] })

test('no marker and no toggle while no ingredient has updated values', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.find('.updated-marker').exists()).toBe(false)
  expect(wrapper.find('.updated-filter').exists()).toBe(false)
  wrapper.unmount()
})

test('rows with updates carry the marker and the toggle counts them', async () => {
  const { wrapper } = await mountPage({ 'GET /api/ingredients': { body: [updatedOats, egg, updatedMilk] } })
  const marked = wrapper.findAll('.ingredient-row').filter((row) => row.find('.updated-marker').exists())
  expect(marked.map((row) => row.get('.q-item__label').text())).toEqual(['Milk', 'Oats'])
  expect(marked[0].get('.updated-marker').text()).toBe('Updated values available')
  expect(wrapper.get('.updated-filter').text()).toBe('Only with updated values (2)')
  wrapper.unmount()
})

test('the toggle lists only those, the search narrows them, and off lists all', async () => {
  const { wrapper } = await mountPage({ 'GET /api/ingredients': { body: [updatedOats, egg, updatedMilk] } })
  await click(wrapper.get('.updated-filter'))
  expect(wrapper.findAll('.ingredient-row')).toHaveLength(2)
  expect(rows(wrapper)[0]).toContain('Milk')
  await field(wrapper, 'Search').setValue('oat')
  expect(wrapper.findAll('.ingredient-row')).toHaveLength(1)
  expect(rows(wrapper)[0]).toContain('Oats')
  await field(wrapper, 'Search').setValue('egg')
  expect(wrapper.findAll('.ingredient-row')).toHaveLength(0)
  expect(wrapper.text()).toContain('No ingredients have updated values.')
  await field(wrapper, 'Search').setValue('')
  await click(wrapper.get('.updated-filter'))
  expect(wrapper.findAll('.ingredient-row')).toHaveLength(3)
  wrapper.unmount()
})

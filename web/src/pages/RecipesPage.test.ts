import { afterEach, expect, test, vi } from 'vitest'
import { button, click, fakeServer, field, mountApp, texts, type FakeServer } from '../test-app'
import { attribute, recipe, tag } from '../test-data'

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 })
const vegan = tag({ id: 1, name: 'vegan' })
const quick = tag({ id: 2, name: 'quick' })
const unused = tag({ id: 3, name: 'organic' })
const porridge = recipe({
  id: 1,
  name: 'Porridge',
  derived_tag_ids: [1],
  extra_tag_ids: [2],
  totals: [
    { attribute_id: 1, value: '233' },
    { attribute_id: 2, value: '10.1' },
  ],
})
const omelette = recipe({
  id: 2,
  name: 'omelette',
  extra_tag_ids: [2],
  totals: [
    { attribute_id: 1, value: '180' },
    { attribute_id: 2, value: '12.6' },
  ],
})
const salad = recipe({ id: 3, name: 'Salad', derived_tag_ids: [1] })

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/recipes': { body: [porridge, omelette, salad] },
    'GET /api/attributes': { body: [energy, protein] },
    'GET /api/tags': { body: [vegan, quick, unused] },
    ...server,
  })
  const { wrapper, router } = await mountApp('/recipes')
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function rows(wrapper: Wrapper) {
  return texts(wrapper, '.recipe-row')
}

function chip(wrapper: Wrapper, name: string) {
  return wrapper.findAll('.tag-filter').find((chip) => chip.text().replace('check', '').trim() === name)!
}

test('recipes are listed by name with their totals per portion and their tags', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Recipes')
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/^omelette\s*Per portion: Energy 180 kcal · Protein 12.6 g\s*quick/),
    expect.stringMatching(/^Porridge\s*Per portion: Energy 233 kcal · Protein 10.1 g\s*vegan, quick/),
    expect.stringMatching(/^Salad\s*vegan/),
  ])
  wrapper.unmount()
})

test('search narrows the list by name, ignoring case', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Search').setValue('PORR')
  expect(rows(wrapper)).toEqual([expect.stringMatching(/^Porridge/)])
  await field(wrapper, 'Search').setValue('xyz')
  expect(wrapper.text()).toContain('No recipes match.')
  wrapper.unmount()
})

test('clearing the search box brings the whole list back', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Search').setValue('PORR')
  expect(rows(wrapper)).toEqual([expect.stringMatching(/^Porridge/)])
  await click(wrapper.get('[aria-label="Clear"]'))
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/^omelette/),
    expect.stringMatching(/^Porridge/),
    expect.stringMatching(/^Salad/),
  ])
  wrapper.unmount()
})

test('tag chips show the tags recipes have, and keep the recipes with every chosen one', async () => {
  const { wrapper } = await mountPage()
  expect(texts(wrapper, '.tag-filter')).toEqual(['vegan', 'quick'])
  await click(chip(wrapper, 'vegan'))
  expect(chip(wrapper, 'vegan').attributes('aria-pressed')).toBe('true')
  expect(rows(wrapper)).toEqual([expect.stringMatching(/^Porridge/), expect.stringMatching(/^Salad/)])
  await click(chip(wrapper, 'quick'))
  expect(rows(wrapper)).toEqual([expect.stringMatching(/^Porridge/)])
  await click(chip(wrapper, 'vegan'))
  expect(rows(wrapper)).toEqual([expect.stringMatching(/^omelette/), expect.stringMatching(/^Porridge/)])
  wrapper.unmount()
})

test('an empty list says so, without search or chips', async () => {
  const { wrapper } = await mountPage({ 'GET /api/recipes': { body: [] } })
  expect(wrapper.text()).toContain('No recipes yet.')
  expect(wrapper.find('input[aria-label="Search"]').exists()).toBe(false)
  expect(wrapper.findAll('.tag-filter')).toHaveLength(0)
  wrapper.unmount()
})

test('a row opens its editor, and the round button a new one', async () => {
  const { wrapper, router } = await mountPage({
    'GET /api/ingredients': { body: [] },
    'GET /api/recipes/1': { body: porridge },
  })
  await click(wrapper.findAll('.recipe-row')[1]!)
  expect(router.currentRoute.value.fullPath).toBe('/recipes/1')
  await router.push('/recipes')
  await click(wrapper.get('[aria-label="New recipe"]'))
  expect(router.currentRoute.value.fullPath).toBe('/recipes/new')
  wrapper.unmount()
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = {
    'GET /api/session': 204,
    'GET /api/recipes': 500,
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
  }
  fakeServer(server)
  const { wrapper } = await mountApp('/recipes')
  expect(wrapper.text()).toContain('Could not load the recipes.')
  server['GET /api/recipes'] = { body: [salad] }
  await click(button(wrapper, 'Try again'))
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

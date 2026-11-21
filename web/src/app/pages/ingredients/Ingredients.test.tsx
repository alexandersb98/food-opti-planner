import { act, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, ingredient } from '../../../test-data'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

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
const egg = ingredient({ id: 2, name: 'egg', unit: 'pcs', basis: '1', values: [{ attribute_id: 1, value: '78' }], recipe_count: 1 })
const milk = ingredient({ id: 3, name: 'Milk', unit: 'ml' })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/ingredients': { body: [oats, egg, milk] },
    'GET /api/attributes': { body: [energy, protein] },
    ...server,
  })
  const app = await mountApp('/ingredients')
  return { ...app, calls }
}

/** The entries' text, read in order. */
async function shownEntries() {
  await screen.findByRole('searchbox', { name: 'Search ingredients' })
  return screen.queryAllByRole('link').filter((link) => link.getAttribute('href')?.match(/\/ingredients\/\d+$/)).map((link) => link.textContent)
}

function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  return router.state.location.pathname
}

test('ingredients are listed A to Z with their basis, values and recipes', async () => {
  await mountPage()
  expect(await screen.findByRole('heading', { level: 1, name: 'Ingredients' })).toBeDefined()
  expect(await shownEntries()).toEqual([
    'eggper 1 pcs · Energy 78 kcalUsed in 1 recipe',
    'Milkper 100 mlUsed in no recipes',
    'Oatsper 100 g · Energy 389 kcal · Protein 16.9 gUsed in 3 recipes',
  ])
  expect(screen.getByText('3 in the larder')).toBeDefined()
})

test('search narrows the list by name, ignoring case, and can be cleared', async () => {
  const { user } = await mountPage()
  const search = await screen.findByRole('searchbox', { name: 'Search ingredients' })
  await user.type(search, 'OA')
  expect(await shownEntries()).toEqual([expect.stringMatching(/^Oats/)])
  expect(screen.getByText('1 ingredient').getAttribute('role')).toBe('status')

  await user.clear(search)
  await user.type(search, 'xyz')
  expect(await shownEntries()).toEqual([])
  expect(screen.getByText('No ingredients match.')).toBeDefined()

  await user.click(screen.getByRole('button', { name: 'Clear the search' }))
  expect(search).toHaveProperty('value', '')
  expect(document.activeElement).toBe(search)
  expect(await shownEntries()).toEqual([expect.stringMatching(/^egg/), expect.stringMatching(/^Milk/), expect.stringMatching(/^Oats/)])
})

test('an empty larder says so and offers a new ingredient', async () => {
  const { user, router } = await mountPage({ 'GET /api/ingredients': { body: [] } })
  expect(await screen.findByText('No ingredients yet.')).toBeDefined()
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.getByText('The larder is empty')).toBeDefined()
  await user.click(screen.getByRole('link', { name: 'New ingredient' }))
  expect(where(router)).toBe('/ingredients/new')
})

test('an entry opens its ingredient', async () => {
  const { user, router } = await mountPage()
  await user.click(await screen.findByRole('link', { name: /^Oats/ }))
  expect(where(router)).toBe('/ingredients/1')
})

test('the add menu opens, offers New ingredient, and closes with Escape', async () => {
  const { user, router } = await mountPage()
  const add = await screen.findByRole('button', { name: 'Add an ingredient' })
  expect(add.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('link', { name: 'New ingredient' })).toBeNull()

  await user.click(add)
  expect(add.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('link', { name: 'New ingredient' })).toBeDefined()
  await user.keyboard('{Escape}')
  expect(add.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(add)

  await user.click(add)
  await user.click(screen.getByRole('link', { name: 'New ingredient' }))
  expect(where(router)).toBe('/ingredients/new')
})

test('the add menu closes on a tap outside it', async () => {
  const { user } = await mountPage()
  const add = await screen.findByRole('button', { name: 'Add an ingredient' })
  await user.click(add)
  await user.click(screen.getByRole('heading', { level: 1 }))
  expect(add.getAttribute('aria-expanded')).toBe('false')
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = {
    'GET /api/session': 204,
    'GET /api/ingredients': 500,
    'GET /api/attributes': { body: [energy] },
  }
  fakeServer(server)
  const { user } = await mountApp('/ingredients')
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Could not load the ingredients.')
  server['GET /api/ingredients'] = { body: [milk] }
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))
  expect(await shownEntries()).toEqual([expect.stringMatching(/^Milk/)])
})

// Updated values from the data source: the mark and the filter.

const protein13 = { attribute_id: 2, value: '13.5', new_value: '13.8' }
const updatedOats = ingredient({ ...oats, updated_values: [protein13] })
const updatedMilk = ingredient({ ...milk, updated_values: [protein13] })

test('no mark and no filter while no ingredient has updated values', async () => {
  await mountPage()
  await screen.findByRole('searchbox')
  expect(screen.queryByText('Updated values available')).toBeNull()
  expect(screen.queryByRole('button', { name: /Only with updated values/ })).toBeNull()
})

test('entries with updated values are marked and the filter counts them', async () => {
  await mountPage({ 'GET /api/ingredients': { body: [updatedOats, egg, updatedMilk] } })
  expect(await shownEntries()).toEqual([
    expect.not.stringContaining('Updated values available'),
    expect.stringMatching(/^Milk.*Updated values available/),
    expect.stringMatching(/^Oats.*Updated values available/),
  ])
  const filter = screen.getByRole('button', { name: 'Only with updated values (2)' })
  expect(filter.getAttribute('aria-pressed')).toBe('false')
})

test('the filter lists only those, the search narrows them, and off lists all', async () => {
  const { user } = await mountPage({ 'GET /api/ingredients': { body: [updatedOats, egg, updatedMilk] } })
  const filter = await screen.findByRole('button', { name: 'Only with updated values (2)' })
  await user.click(filter)
  expect(filter.getAttribute('aria-pressed')).toBe('true')
  expect(await shownEntries()).toEqual([expect.stringMatching(/^Milk/), expect.stringMatching(/^Oats/)])

  const search = screen.getByRole('searchbox', { name: 'Search ingredients' })
  await user.type(search, 'oat')
  expect(await shownEntries()).toEqual([expect.stringMatching(/^Oats/)])
  await user.clear(search)
  await user.type(search, 'egg')
  expect(await shownEntries()).toEqual([])
  expect(screen.getByText('No ingredients have updated values.')).toBeDefined()

  await user.clear(search)
  await user.click(filter)
  expect(await shownEntries()).toHaveLength(3)
})

test('the search and the filter are kept in the address, so going back finds them', async () => {
  const { user, router } = await mountPage({ 'GET /api/ingredients': { body: [updatedOats, egg, updatedMilk] } })
  await user.click(await screen.findByRole('button', { name: 'Only with updated values (2)' }))
  await user.type(screen.getByRole('searchbox', { name: 'Search ingredients' }), 'oat')
  expect(router.state.location.search).toBe('?updated=1&q=oat')
  await user.click(screen.getByRole('link', { name: /^Oats/ }))
  expect(where(router)).toBe('/ingredients/1')
  await act(() => router.navigate(-1))
  expect(await screen.findByRole('searchbox', { name: 'Search ingredients' })).toHaveProperty('value', 'oat')
  expect(screen.getByRole('button', { name: 'Only with updated values (2)' }).getAttribute('aria-pressed')).toBe('true')
  expect(await shownEntries()).toEqual([expect.stringMatching(/^Oats/)])
})

import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, recipe, tag } from '../../../test-data'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

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
const pancakes = recipe({ id: 4, name: 'Pancakes' })

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/recipes': { body: [porridge, omelette, salad, pancakes] },
    'GET /api/attributes': { body: [energy, protein] },
    'GET /api/tags': { body: [vegan, quick, unused] },
    'GET /api/health': { body: { database: true, ai_configured: true } },
    ...server,
  })
  const app = await mountApp('/recipes')
  await screen.findByRole('heading', { level: 1, name: 'The recipe index' })
  return { ...app, calls }
}

/** The index as letters and the names under each. */
async function letters() {
  await screen.findAllByRole('list')
  return screen.queryAllByRole('heading', { level: 2 }).map((heading) => {
    const section = heading.closest('section')!
    const names = within(section)
      .getAllByRole('link')
      .map((link) => link.querySelector('.recipes-name')!.textContent)
    return [heading.firstChild!.textContent, ...names].join(' ')
  })
}

function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  return router.state.location.pathname
}

function chip(name: string) {
  return within(screen.getByRole('group', { name: 'Narrow by tag' })).getByRole('button', { name })
}

test('recipes are filed A to Z under letter headings, with their tags and totals per portion', async () => {
  await mountPage()
  expect(await screen.findByText('4 dishes, A to Z')).toBeDefined()
  expect(await letters()).toEqual(['O omelette', 'P Pancakes Porridge', 'S Salad'])
  expect(screen.getByRole('heading', { level: 2, name: 'P, 2 recipes' })).toBeDefined()

  const entry = screen.getByRole('link', { name: /^Porridge/ })
  expect(entry.getAttribute('href')).toBe('/recipes/1')
  expect(entry.textContent).toBe('Porridgevegan, quickPer portion: Energy 233 kcal · Protein 10.1 g')
  expect(screen.getByRole('link', { name: /^Salad/ }).textContent).toBe('Saladvegan')
  expect(screen.getByRole('link', { name: /^Pancakes/ }).textContent).toBe('Pancakes')
})

test('an entry opens its recipe', async () => {
  const { user, router } = await mountPage()
  await user.click(await screen.findByRole('link', { name: /^Porridge/ }))
  expect(where(router)).toBe('/recipes/1')
})

test('search narrows the list by name, ignoring case, and says how many are shown', async () => {
  const { user } = await mountPage()
  const search = await screen.findByRole('searchbox', { name: 'Search recipes' })
  await user.type(search, 'PORR')
  expect(await letters()).toEqual(['P Porridge'])
  expect(within(screen.getByRole('main')).getByRole('status').textContent).toBe('1 recipe shown')

  await user.clear(search)
  expect(await letters()).toEqual(['O omelette', 'P Pancakes Porridge', 'S Salad'])
  expect(within(screen.getByRole('main')).getByRole('status').textContent).toBe('')
})

test('no match says so, and clearing the search brings every recipe back', async () => {
  const { user } = await mountPage()
  const search = await screen.findByRole('searchbox', { name: 'Search recipes' })
  await user.type(search, 'xyz')
  expect(screen.getByText('No recipes match.')).toBeDefined()
  expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)

  await user.click(screen.getByRole('button', { name: 'Clear the search' }))
  expect((search as HTMLInputElement).value).toBe('')
  expect(document.activeElement).toBe(search)
  expect(await letters()).toEqual(['O omelette', 'P Pancakes Porridge', 'S Salad'])
})

test('tag chips show the tags recipes have, in tag order, and keep the recipes with every chosen one', async () => {
  const { user } = await mountPage()
  const group = await screen.findByRole('group', { name: 'Narrow by tag' })
  expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['vegan', 'quick'])

  await user.click(chip('vegan'))
  expect(chip('vegan').getAttribute('aria-pressed')).toBe('true')
  expect(await letters()).toEqual(['P Porridge', 'S Salad'])
  await user.click(chip('quick'))
  expect(await letters()).toEqual(['P Porridge'])
  await user.click(chip('vegan'))
  expect(chip('vegan').getAttribute('aria-pressed')).toBe('false')
  expect(await letters()).toEqual(['O omelette', 'P Porridge'])
})

test('chosen tags with a search that leaves nothing can be cleared together', async () => {
  const { user } = await mountPage()
  await user.click(await screen.findByRole('button', { name: 'vegan' }))
  await user.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'omel')
  expect(screen.getByText('No recipes match.')).toBeDefined()
  await user.click(screen.getByRole('button', { name: 'Clear the search' }))
  expect(chip('vegan').getAttribute('aria-pressed')).toBe('false')
  expect(await letters()).toHaveLength(3)
})

test('chosen tags no recipe has together offer to clear the tags', async () => {
  const { user } = await mountPage({ 'GET /api/recipes': { body: [omelette, salad] } })
  await user.click(await screen.findByRole('button', { name: 'vegan' }))
  await user.click(chip('quick'))
  expect(screen.getByText('No recipes match.')).toBeDefined()
  await user.click(screen.getByRole('button', { name: 'Clear the chosen tags' }))
  expect(await letters()).toEqual(['O omelette', 'S Salad'])
})

test('an empty index says so, without search or chips', async () => {
  await mountPage({ 'GET /api/recipes': { body: [] } })
  expect(await screen.findByText('No recipes yet.')).toBeDefined()
  expect(screen.getByText('No dishes yet')).toBeDefined()
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.queryByRole('group', { name: 'Narrow by tag' })).toBeNull()
  // adding is still at hand
  expect(screen.getByRole('button', { name: 'Add recipe' })).toBeDefined()
})

test('the add menu opens in place: New recipe goes to the empty recipe', async () => {
  const { user, router } = await mountPage()
  const add = await screen.findByRole('button', { name: 'Add recipe' })
  expect(add.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('link', { name: /New recipe/ })).toBeNull()

  await user.click(add)
  expect(add.getAttribute('aria-expanded')).toBe('true')
  const menu = document.getElementById(add.getAttribute('aria-controls')!)!
  expect(within(menu).getAllByRole('listitem').map((item) => item.querySelector('.recipes-add-label')!.textContent)).toEqual([
    'New recipe',
    'Import recipe',
  ])
  await user.click(within(menu).getByRole('link', { name: /New recipe/ }))
  expect(where(router)).toBe('/recipes/new')
})

test('Escape closes the add menu and puts focus back on its button', async () => {
  const { user } = await mountPage()
  const add = await screen.findByRole('button', { name: 'Add recipe' })
  await user.click(add)
  await user.keyboard('{Tab}')
  expect(document.activeElement?.textContent).toContain('New recipe')
  await user.keyboard('{Escape}')
  expect(add.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(add)
})

test('Import recipe is a link to the import page when the server has an AI key', async () => {
  const { user, router } = await mountPage()
  await screen.findByRole('link', { name: /^Porridge/ })
  await user.click(screen.getByRole('button', { name: 'Add recipe' }))
  const link = await screen.findByRole('link', { name: /Import recipe/ })
  await user.click(link)
  await waitFor(() => expect(where(router)).toBe('/recipes/import'))
})

test.each([
  ['no AI key', { 'GET /api/health': { body: { database: true, ai_configured: false } } }],
  ['a health call that fails', { 'GET /api/health': 500 }],
])('Import recipe is disabled with %s, saying it needs one', async (_name, server) => {
  const { user, router } = await mountPage(server as FakeServer)
  await user.click(await screen.findByRole('button', { name: 'Add recipe' }))
  await screen.findByText('Needs an AI key')
  expect(screen.queryByRole('link', { name: /Import recipe/ })).toBeNull()
  const item = screen.getByText('Import recipe').closest('[aria-disabled]')!
  expect(item.getAttribute('aria-disabled')).toBe('true')
  await user.click(item)
  expect(where(router)).toBe('/recipes')
  expect(await letters()).toHaveLength(3)
})

test('the index shows while the AI-key check is still pending', async () => {
  let answer: (reply: { body: unknown }) => void = () => {}
  const { user } = await mountPage({
    'GET /api/health': () => new Promise((resolve) => (answer = resolve)),
  })
  expect(await letters()).toEqual(['O omelette', 'P Pancakes Porridge', 'S Salad'])
  await user.click(screen.getByRole('button', { name: 'Add recipe' }))
  expect(screen.getByText('Checking for an AI key…')).toBeDefined()
  expect(screen.queryByRole('link', { name: /Import recipe/ })).toBeNull()

  answer({ body: { database: true, ai_configured: true } })
  expect(await screen.findByRole('link', { name: /Import recipe/ })).toBeDefined()
})

test('a failed load offers to try again', async () => {
  const { user } = await mountPage({ 'GET /api/recipes': 500 })
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load the recipes.')
  fakeServer({
    'GET /api/session': 204,
    'GET /api/recipes': { body: [salad] },
    'GET /api/attributes': { body: [energy, protein] },
    'GET /api/tags': { body: [vegan, quick, unused] },
  })
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(async () => expect(await letters()).toEqual(['S Salad']))
})

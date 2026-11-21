import { expect, test } from 'vitest'
import { detailRoutes, pageFor, registry, registryPage } from './registry'

test('the Contents pages in order, numbered from 1', () => {
  expect(registry.map(({ id, folio }) => [folio, id])).toEqual([
    [1, 'brief'],
    [2, 'menu'],
    [3, 'recipes'],
    [4, 'archive'],
    [5, 'ingredients'],
    [6, 'attributes'],
    [7, 'tags'],
    [8, 'settings'],
  ])
})

test('each page has its route and its message keys', () => {
  expect(registry.map(({ path }) => path)).toEqual(['/', '/plans/new', '/recipes', '/plans', '/ingredients', '/attributes', '/tags', '/settings'])
  expect(registryPage('menu')).toMatchObject({
    title: 'shell.pages.menu.title',
    description: 'shell.pages.menu.description',
    run: 'shell.pages.menu.run',
  })
})

test('a Contents page belongs to itself', () => {
  for (const page of registry) expect(pageFor(page.path)).toBe(page)
})

test('a detail route belongs to the page that lists it', () => {
  const parents = Object.fromEntries(
    ['/plans/3', '/recipes/new', '/recipes/import', '/recipes/12', '/ingredients/new', '/ingredients/7', '/settings/data-sources/livsmedelsverket', '/plan/schedule', '/plan/recipes'].map(
      (path) => [path, pageFor(path)?.id],
    ),
  )
  expect(parents).toEqual({
    '/plans/3': 'archive',
    '/recipes/new': 'recipes',
    '/recipes/import': 'recipes',
    '/recipes/12': 'recipes',
    '/ingredients/new': 'ingredients',
    '/ingredients/7': 'ingredients',
    '/settings/data-sources/livsmedelsverket': 'settings',
    '/plan/schedule': 'brief',
    '/plan/recipes': 'brief',
  })
  // the unsaved plan is The Menu itself, not a saved one
  expect(pageFor('/plans/new')?.id).toBe('menu')
  expect(detailRoutes.every(({ page }) => registryPage(page))).toBe(true)
})

test('a path the app does not have belongs to no page', () => {
  expect(pageFor('/nowhere')).toBeUndefined()
  expect(pageFor('/recipes/3/extra')).toBeUndefined()
})

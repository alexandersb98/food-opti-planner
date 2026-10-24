import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fakeServer, mountApp } from '../test-app'

beforeEach(() => {
  fakeServer({ 'GET /api/session': 204, 'POST /api/logout': 204 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('the menu lists the five pages in order, then Log out', async () => {
  const { wrapper } = await mountApp('/')
  await wrapper.get('button[aria-label="Menu"]').trigger('click')
  const labels = wrapper.findAll('.q-drawer .q-item__section--main').map((label) => label.text())
  expect(labels).toEqual([
    'Plan',
    'Recipes',
    'Ingredients',
    'Attributes',
    'Tags',
    'Log out',
  ])
  wrapper.unmount()
})

test('the start page is the plan', async () => {
  const { wrapper } = await mountApp('/')
  expect(wrapper.get('h1').text()).toBe('Plan')
  wrapper.unmount()
})

test('Log out ends the session and shows the login page', async () => {
  const calls = fakeServer({ 'GET /api/session': 204, 'POST /api/logout': 204 })
  const { wrapper, router } = await mountApp('/recipes')
  await wrapper.get('button[aria-label="Menu"]').trigger('click')
  const logOut = wrapper.findAll('.q-drawer .q-item').find((item) => item.text().includes('Log out'))
  await logOut!.trigger('click')
  await flushPromises()
  expect(calls).toContain('POST /api/logout')
  expect(router.currentRoute.value.name).toBe('login')
  wrapper.unmount()
})

test('the menu shows the catalog counts, fresh each time it opens', async () => {
  const server = { 'GET /api/session': 204, 'GET /api/counts': { body: { recipes: 5, ingredients: 20, attributes: 8, tags: 3 } } }
  fakeServer(server)
  const { wrapper } = await mountApp('/')
  const menu = wrapper.get('button[aria-label="Menu"]')
  const count = (page: string) => {
    const item = wrapper.findAll('.q-drawer .q-item').find((i) => i.text().includes(page))
    return item!.find('.menu-count').text()
  }
  await menu.trigger('click')
  await flushPromises()
  expect([count('Recipes'), count('Ingredients'), count('Attributes'), count('Tags')]).toEqual(['5', '20', '8', '3'])

  server['GET /api/counts'] = { body: { recipes: 6, ingredients: 21, attributes: 9, tags: 4 } }
  await menu.trigger('click')
  await menu.trigger('click')
  await flushPromises()
  expect([count('Recipes'), count('Ingredients'), count('Attributes'), count('Tags')]).toEqual(['6', '21', '9', '4'])
  wrapper.unmount()
})

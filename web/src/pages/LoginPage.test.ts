import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../api/client'
import { fakeServer, mountApp } from '../test-app'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function logIn(wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'], password: string) {
  await wrapper.get('input[type="password"]').setValue(password)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

test('without a session, a page shows the login page instead', async () => {
  fakeServer({ 'GET /api/session': 401 })
  const { wrapper, router } = await mountApp('/recipes')
  expect(router.currentRoute.value.name).toBe('login')
  expect(router.currentRoute.value.query.redirect).toBe('/recipes')
  expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  wrapper.unmount()
})

test('a 401 from any API call leads to the login page', async () => {
  fakeServer({ 'GET /api/session': 204, 'GET /api/health': 401 })
  const { wrapper, router } = await mountApp('/tags')
  expect(router.currentRoute.value.name).toBe('tags')
  await api.GET('/api/health')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('login')
  expect(router.currentRoute.value.query.redirect).toBe('/tags')
  wrapper.unmount()
})

test('a wrong password says so and stays on the login page', async () => {
  fakeServer({ 'GET /api/session': 401, 'POST /api/login': 401 })
  const { wrapper, router } = await mountApp('/login')
  await logIn(wrapper, 'wrong')
  expect(wrapper.text()).toContain('Wrong password.')
  expect(router.currentRoute.value.name).toBe('login')
  wrapper.unmount()
})

test('the right password goes back to the page that asked for it', async () => {
  const server = { 'GET /api/session': 401, 'POST /api/login': 204 }
  fakeServer(server)
  const { wrapper, router } = await mountApp('/ingredients')
  server['GET /api/session'] = 204
  await logIn(wrapper, 'right')
  expect(router.currentRoute.value.path).toBe('/ingredients')
  expect(wrapper.get('h1').text()).toBe('Ingredients')
  wrapper.unmount()
})

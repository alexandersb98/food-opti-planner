import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { fakeServer, mountApp } from '../../test-app'

test('a deep path shows the placeholder page, its title through the translator', async () => {
  fakeServer({ 'GET /api/health': { body: { database: true, ai_configured: false } } })
  await mountApp('/recipes/3')

  expect(screen.getByRole('heading', { level: 1, name: 'Meal planner' })).toBeDefined()
  expect(screen.getByText('/recipes/3')).toBeDefined()
  expect(screen.getByRole('link', { name: 'the current app' }).getAttribute('href')).toBe('/')
})

test('the harness answers and records the calls to the server', async () => {
  const calls = fakeServer({ 'GET /api/health': { body: { database: true, ai_configured: false } } })
  await mountApp('/')

  expect(await screen.findByText('The server answers.')).toBeDefined()
  expect(calls).toEqual(['GET /api/health'])
})

test('a call the fake server does not know answers 404', async () => {
  const calls = fakeServer({})
  await mountApp('/')

  expect(await screen.findByText('The server does not answer.')).toBeDefined()
  expect(calls).toEqual(['GET /api/health'])
})

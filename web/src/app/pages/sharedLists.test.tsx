import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, ingredient } from '../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeReply } from '../test-app'

// The shared lists through the app: a page opened after another reuses the
// attributes and ingredients the first one loaded, and after a change the
// next page waits for the server's copy instead.

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const fibre = attribute({ id: 3, name: 'Fibre', unit: 'g', decimals: 3 })
const oats = ingredient({ id: 1, name: 'Oats', values: [{ attribute_id: 3, value: '10' }] })

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the lists are reused from page to page, and fetched afresh after a change', async () => {
  // The first answer of each list comes at once; later ones wait for the test.
  const waiting: Array<() => void> = []
  const later = (first: unknown, next: unknown) => {
    let answered = false
    return () => {
      if (answered) return new Promise<FakeReply>((resolve) => waiting.push(() => resolve({ body: next })))
      answered = true
      return { body: first }
    }
  }
  const calls = fakeServer({
    'GET /api/session': 204,
    ...unitRoutes(),
    'GET /api/ingredients': later([oats], [oats]),
    'GET /api/attributes': later([energy], [energy, fibre]),
    'POST /api/attributes': { status: 201, body: fibre },
  })
  const { user, router } = await mountApp('/ingredients')
  expect(await screen.findByRole('link', { name: /^Oats/ })).toBeDefined()
  // Fibre is not known yet: the value shows unnamed.
  expect(screen.getByRole('link', { name: /^Oats/ }).textContent).not.toContain('Fibre')

  // The attributes page shows the held list at once; its refresh still waits.
  await act(() => router.navigate('/attributes'))
  expect(await screen.findByRole('button', { name: /^Energy\b/ })).toBeDefined()
  expect(calls.filter((call) => call === 'GET /api/attributes')).toHaveLength(2)

  // Adding an attribute invalidates the attributes (and nothing waits on
  // the refresh still in flight, which no longer counts).
  await user.click(screen.getByRole('button', { name: '+ New attribute' }))
  const form = screen.getByRole('form')
  await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Fibre')
  await user.click(within(form).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())

  // Back on the ingredients, the page waits for the attributes, though the
  // ingredients are still held.
  await act(() => router.navigate('/ingredients'))
  expect(await screen.findByText('Loading…')).toBeDefined()
  expect(screen.queryByRole('link', { name: /^Oats/ })).toBeNull()
  act(() => waiting.splice(0).forEach((answer) => answer()))
  expect(await screen.findByRole('link', { name: /Fibre 10 g/ })).toBeDefined()
})

import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Preferences } from '../../../api/types'
import { attribute, dataSource, sourceColumn } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

// The first test loads the lazy route; under a loaded machine 5 s is too short.
vi.setConfig({ testTimeout: 15_000 })

// Create attribute from a column's Attribute choice (ticket 41). Parity with
// the Vue NewAttributeDialog tests and DataSourcePage's Create attribute ones.

const columns = [
  sourceColumn({ id: 1, name: 'TEST Energy', unit: 'kcal' }),
  sourceColumn({ id: 2, name: 'TEST Protein', unit: 'g', attribute_id: 1 }),
  sourceColumn({ id: 3, name: 'TEST Vitamin D', unit: 'µg' }),
  sourceColumn({ id: 5, name: 'TEST Other', unit: 'dose' }),
  sourceColumn({ id: 6, name: 'TEST Pieces', unit: 'st' }),
]
const source = dataSource({ columns, column_count: 5, mapped_count: 1 })
const attributes = [
  attribute({ id: 1, name: 'Protein', unit: 'g', decimals: 1 }),
  attribute({ id: 2, name: 'Fat', unit: 'g', decimals: 1 }),
]
const carbs = attribute({ id: 9, name: 'Carbs', unit: 'g', decimals: 3 })

async function mountPage(server: FakeServer = {}, prefs: Partial<Preferences> = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/data-sources/testsource': { body: source },
    'GET /api/attributes': { body: attributes },
    ...unitRoutes(prefs),
    ...server,
  })
  const app = await mountApp('/settings/data-sources/testsource')
  await screen.findByRole('heading', { level: 1, name: 'TEST Source' }, { timeout: 5000 })
  // the unit catalogue decides which columns' kinds are known
  await waitFor(() => expect(calls).toContain('GET /api/units'))
  return { ...app, calls }
}

const choice = (column: string) => screen.getByRole<HTMLSelectElement>('combobox', { name: `Attribute for ${column}` })
const shownChoice = (column: string) => choice(column).selectedOptions[0]?.textContent
const sheet = () => screen.getByRole('dialog', { name: 'New attribute' })
const field = (label: string) => within(sheet()).getByLabelText<HTMLInputElement>(label, { selector: 'input' })
const posts = (calls: string[]) => calls.filter((call) => call.startsWith('POST'))

/** Chooses Create attribute… in a column's choice; answers the open sheet. */
async function openCreate(user: Awaited<ReturnType<typeof mountPage>>['user'], column: string) {
  await waitFor(() => expect([...choice(column).options].map((o) => o.textContent)).toContain('Create attribute…'))
  await user.selectOptions(choice(column), 'Create attribute…')
  return screen.findByRole('dialog', { name: 'New attribute' })
}

// --- the form it opens with ----------------------------------------------------------

test('it opens with an empty name, 3 decimals and the preferred unit of the column kind, ready to type', async () => {
  const { user } = await mountPage({}, { 'unit.mass': 'kg' })
  await openCreate(user, 'TEST Protein')
  expect(field('Name').value).toBe('')
  await waitFor(() => expect(field('Unit').value).toBe('kg'))
  expect(field('Decimals').value).toBe('3')
  expect(document.activeElement).toBe(field('Name'))
  expect(within(sheet()).getByText('Add creates the attribute and maps TEST Protein to it.')).toBeDefined()
  expect(within(sheet()).getByText("Converts with g, the column’s unit.")).toBeDefined()
  // the choice still shows what the column has
  expect(shownChoice('TEST Protein')).toBe('Protein')
})

test('a kcal column starts with the preferred energy unit', async () => {
  const { user } = await mountPage({}, { 'unit.energy': 'kJ' })
  await openCreate(user, 'TEST Energy')
  await waitFor(() => expect(field('Unit').value).toBe('kJ'))
})

test('a column in free text starts with its own unit, and so does st', async () => {
  const { user } = await mountPage()
  await openCreate(user, 'TEST Other')
  expect(field('Unit').value).toBe('dose')
  await user.click(within(sheet()).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await openCreate(user, 'TEST Pieces')
  expect(field('Unit').value).toBe('st')
})

test('the unit list offers the column kind only', async () => {
  const { user } = await mountPage()
  await openCreate(user, 'TEST Protein')
  await user.click(field('Unit'))
  const list = within(sheet()).getByRole('listbox')
  expect(within(list).getAllByRole('group').map((group) => group.firstElementChild?.textContent)).toEqual(['Mass'])
  expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual([
    'g (gram)',
    'µg (microgram)',
    'mg (milligram)',
    'kg (kilogram)',
    'oz (ounce)',
    'lb (pound)',
  ])
})

// --- what Add checks ------------------------------------------------------------

test('an empty name and out-of-range decimals show their errors, send nothing and mark the name', async () => {
  const { user, calls } = await mountPage()
  await openCreate(user, 'TEST Protein')
  await user.clear(field('Decimals'))
  await user.type(field('Decimals'), '9')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))
  expect(within(sheet()).getByText('Enter a name.')).toBeDefined()
  expect(within(sheet()).getByText('A whole number from 0 to 6.')).toBeDefined()
  expect(field('Name').getAttribute('aria-invalid')).toBe('true')
  expect(field('Decimals').getAttribute('aria-invalid')).toBe('true')
  await waitFor(() => expect(document.activeElement).toBe(field('Name')))
  expect(posts(calls)).toEqual([])
})

test('a unit that does not convert with the column shows that and sends nothing', async () => {
  const { user, calls } = await mountPage()
  await openCreate(user, 'TEST Protein')
  await user.type(field('Name'), 'Carbs')
  await user.clear(field('Unit'))
  await user.type(field('Unit'), 'kcal')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))
  expect(within(sheet()).getByText('Must convert with g.')).toBeDefined()
  expect(field('Unit').getAttribute('aria-invalid')).toBe('true')
  expect(posts(calls)).toEqual([])
})

// --- creating, then mapping --------------------------------------------------------

test('Add creates the attribute, maps the column to it, closes and lists it for the others', async () => {
  const order: string[] = []
  const sent: unknown[] = []
  const puts: unknown[] = []
  const { user } = await mountPage({
    'POST /api/attributes': (body) => {
      order.push('POST')
      sent.push(body)
      return { status: 201, body: carbs }
    },
    'PUT /api/data-sources/testsource/columns/2': (body) => {
      order.push('PUT')
      puts.push(body)
      return { body: { ...columns[1], attribute_id: 9 } }
    },
  })
  await openCreate(user, 'TEST Protein')
  await user.type(field('Name'), ' Carbs ')
  await user.clear(field('Decimals'))
  await user.type(field('Decimals'), '1')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))

  await waitFor(() => expect(shownChoice('TEST Protein')).toBe('Carbs'))
  expect(sent).toEqual([{ name: 'Carbs', unit: 'g', decimals: 1 }])
  expect(order).toEqual(['POST', 'PUT'])
  expect(puts).toEqual([{ attribute_id: 9 }])
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByRole('alert')).toBeNull()
  // focus goes back to the choice it was opened from
  expect(document.activeElement).toBe(choice('TEST Protein'))
  expect([...choice('TEST Vitamin D').options].map((o) => o.textContent)).toContain('Carbs (taken by TEST Protein)')
})

test('a mapping that fails after the attribute was created says so on the row and lists the attribute', async () => {
  const { user } = await mountPage({
    'POST /api/attributes': { status: 201, body: carbs },
    'PUT /api/data-sources/testsource/columns/2': 500,
  })
  await openCreate(user, 'TEST Protein')
  await user.type(field('Name'), 'Carbs')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The attribute was created but could not be mapped.')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(shownChoice('TEST Protein')).toBe('Protein')
  expect([...choice('TEST Protein').options].map((o) => o.textContent)).toContain('Carbs')
})

test('a name in use shows on the name field, the sheet stays open and nothing is mapped', async () => {
  const { user, calls } = await mountPage({
    'POST /api/attributes': { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'x' }] } },
  })
  await openCreate(user, 'TEST Protein')
  await user.type(field('Name'), 'Protein')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))
  expect(await within(sheet()).findByText('An attribute with this name already exists.')).toBeDefined()
  expect(field('Name').getAttribute('aria-invalid')).toBe('true')
  expect(calls.filter((call) => call.startsWith('PUT'))).toEqual([])
})

test('a failing save says so and the sheet stays open', async () => {
  const { user, calls } = await mountPage({ 'POST /api/attributes': 500 })
  await openCreate(user, 'TEST Protein')
  await user.type(field('Name'), 'Carbs')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))
  expect((await within(sheet()).findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(sheet()).toBeDefined()
  expect(calls.filter((call) => call.startsWith('PUT'))).toEqual([])
})

// --- cancelling ---------------------------------------------------------------------

test('Cancel changes nothing and sends nothing, and opening again shows a fresh form', async () => {
  const { user, calls } = await mountPage()
  await openCreate(user, 'TEST Protein')
  await user.type(field('Name'), 'Half typed')
  await user.clear(field('Decimals'))
  await user.type(field('Decimals'), '9')
  await user.click(within(sheet()).getByRole('button', { name: 'Add' }))
  await user.click(within(sheet()).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(shownChoice('TEST Protein')).toBe('Protein')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(calls.filter((call) => call.startsWith('POST') || call.startsWith('PUT'))).toEqual([])

  await openCreate(user, 'TEST Protein')
  expect(field('Name').value).toBe('')
  expect(field('Decimals').value).toBe('3')
  expect(within(sheet()).queryByText('Enter a name.')).toBeNull()
})

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { DataSource } from '../../../api/types'
import { attribute, dataSource, sourceColumn } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeReply, type FakeServer } from '../../test-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

// Parity with the Vue DataSourcePage and SourceColumnRow tests (Create
// attribute, ticket 41, is in CreateAttribute.test.tsx).

const columns = [
  sourceColumn({ id: 1, name: 'TEST Energy', unit: 'kcal' }),
  sourceColumn({ id: 2, name: 'TEST Protein', unit: 'g', attribute_id: 1 }),
  sourceColumn({ id: 3, name: 'TEST Vitamin D', unit: 'µg' }),
  sourceColumn({ id: 4, name: 'TEST Alcohol', unit: '', withdrawn: true }),
]
const source = dataSource({ columns, column_count: 3, mapped_count: 1 })
const attributes = [
  attribute({ id: 1, name: 'Protein', unit: 'g', decimals: 1 }),
  attribute({ id: 2, name: 'Fat', unit: 'g', decimals: 1 }),
  attribute({ id: 3, name: 'Energy', unit: 'kcal' }),
  attribute({ id: 4, name: 'Iron', unit: 'mg', decimals: 2 }),
]

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/data-sources/testsource': { body: source },
    'GET /api/attributes': { body: attributes },
    ...unitRoutes(),
    ...server,
  })
  const app = await mountApp('/settings/data-sources/testsource')
  await screen.findByRole('heading', { level: 1, name: 'TEST Source' }, { timeout: 5000 })
  // the unit catalogue decides which attributes a column is offered
  await waitFor(() => expect(calls).toContain('GET /api/units'))
  return { ...app, calls }
}

const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')
const names = () => rows().map((row) => row.querySelector('.ds-name')?.textContent)
const choice = (column: string) => screen.getByRole<HTMLSelectElement>('combobox', { name: `Attribute for ${column}` })
const shownChoice = (column: string) => {
  const select = choice(column)
  return select.selectedOptions[0]?.textContent
}

/** The entries of a column's Attribute choice, with "(off)" after a disabled one. */
async function entries(column: string) {
  await waitFor(() => expect(choice(column).options.length).toBeGreaterThan(2))
  return [...choice(column).options].map((option) => option.textContent + (option.disabled ? ' (off)' : ''))
}

test('the heading is the source name, with the version, import time and attribution, and a way back to Settings', async () => {
  await mountPage()
  const facts = document.querySelector('dl')!
  expect(within(facts).getByText('Version').nextElementSibling?.textContent).toBe('2026-01-01')
  const imported = within(facts).getByText('Imported').nextElementSibling!.querySelector('time')!
  expect(imported.getAttribute('datetime')).toBe('2026-01-01T12:00:00Z')
  expect(imported.textContent).toBe(new Date('2026-01-01T12:00:00Z').toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' }))
  expect(within(facts).getByText('Attribution').nextElementSibling?.textContent).toBe('TEST data, not real: for tests only.')
  expect(screen.getByRole('link', { name: 'Back to Settings' }).getAttribute('href')).toBe('/settings')
  // the running head names the source, on Settings' folio
  const masthead = within(screen.getByRole('banner'))
  await waitFor(() => expect(masthead.getByText('TEST Source')).toBeDefined())
  expect(masthead.getByText('8')).toBeDefined()
})

test('without an attribution there is no attribution line', async () => {
  await mountPage({ 'GET /api/data-sources/testsource': { body: { ...source, attribution: null } } })
  expect(screen.queryByText('Attribution')).toBeNull()
})

test('an unknown source shows the load message', async () => {
  fakeServer({ 'GET /api/session': 204, 'GET /api/data-sources/testsource': { status: 404, body: { detail: 'No such data source' } }, 'GET /api/attributes': { body: attributes } })
  await mountApp('/settings/data-sources/testsource')
  expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain('Could not load the data source.')
})

test('failing attributes make the page show the load message, with no columns', async () => {
  fakeServer({ 'GET /api/session': 204, 'GET /api/data-sources/testsource': { body: source }, 'GET /api/attributes': 500 })
  await mountApp('/settings/data-sources/testsource')
  expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain('Could not load the data source.')
  expect(screen.queryByRole('list')).toBeNull()
})

// --- the colour ------------------------------------------------------------------

const colourInput = () => screen.getByLabelText<HTMLInputElement>('Colour')

test('the colour input shows the stored colour', async () => {
  await mountPage()
  expect(colourInput().type).toBe('color')
  expect(colourInput().value).toBe('#1976d2')
})

test('a chosen colour is saved once, when the picker closes, and shown', async () => {
  const patches: unknown[] = []
  await mountPage({
    'PATCH /api/data-sources/testsource': (body) => {
      patches.push(body)
      return { body: { ...source, ...(body as object) } }
    },
  })
  // dragging through the picker fires `input` events
  fireEvent.input(colourInput(), { target: { value: '#ff0000' } })
  fireEvent.input(colourInput(), { target: { value: '#ee0000' } })
  expect(colourInput().value).toBe('#ee0000')
  expect(patches).toEqual([]) // nothing is sent until the picker closes
  fireEvent.change(colourInput())
  await waitFor(() => expect(patches).toEqual([{ colour: '#ee0000' }]))
  expect(colourInput().value).toBe('#ee0000')
})

test('a refused colour says so and the input goes back to the stored colour', async () => {
  await mountPage({ 'PATCH /api/data-sources/testsource': { status: 422, body: { detail: [] } } })
  fireEvent.input(colourInput(), { target: { value: '#ff0000' } })
  fireEvent.change(colourInput())
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(colourInput().value).toBe('#1976d2')
  expect(colourInput().getAttribute('aria-invalid')).toBe('true')
})

// --- the columns ------------------------------------------------------------------

test('columns keep the server order, withdrawn last and marked', async () => {
  await mountPage()
  expect(screen.getByRole('heading', { level: 2, name: 'Columns' })).toBeDefined()
  expect(screen.getByText('3 columns')).toBeDefined()
  expect(names()).toEqual(['TEST Energy', 'TEST Protein', 'TEST Vitamin D', 'TEST Alcohol'])
  expect(rows().map((row) => row.querySelector('.ds-meta')?.textContent)).toEqual(['kcal', 'g', 'µg', 'No longer in the source'])
  expect(rows().map((row) => row.classList.contains('ds-row-withdrawn'))).toEqual([false, false, false, true])
  // a withdrawn column can still be mapped
  expect(choice('TEST Alcohol').disabled).toBe(false)
})

test('the search narrows the columns by name, ignoring case, keeps their order and the choices', async () => {
  const { user } = await mountPage()
  const search = screen.getByRole('searchbox', { name: 'Search columns' })
  await user.type(search, 'T')
  expect(rows()).toHaveLength(4)
  await user.clear(search)
  await user.type(search, 'PRO')
  expect(names()).toEqual(['TEST Protein'])
  expect(shownChoice('TEST Protein')).toBe('Protein')
  await user.clear(search)
  await user.type(search, 'vit')
  expect(names()).toEqual(['TEST Vitamin D'])
  await user.clear(search)
  await user.type(search, 'zzz')
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.getByText('No column is called “zzz”.')).toBeDefined()
  await user.click(screen.getByRole('button', { name: 'Clear the search' }))
  expect(names()).toHaveLength(4)
  expect(document.activeElement).toBe(search)
  expect(['TEST Energy', 'TEST Protein', 'TEST Vitamin D', 'TEST Alcohol'].map(shownChoice)).toEqual([
    'Not mapped',
    'Protein',
    'Not mapped',
    'Not mapped',
  ])
})

test('a g column offers Not mapped and the attributes that convert with g, in order', async () => {
  await mountPage()
  expect(await entries('TEST Protein')).toEqual(['Not mapped', 'Protein', 'Fat', 'Iron', 'Create attribute…'])
  expect(choice('TEST Protein').querySelector('optgroup')?.label).toBe('Converts with g')
})

test('a kcal column offers energy attributes only, a µg column the mass ones', async () => {
  await mountPage()
  expect(await entries('TEST Energy')).toEqual(['Not mapped', 'Energy', 'Create attribute…'])
  expect(await entries('TEST Vitamin D')).toEqual(['Not mapped', 'Protein (taken by TEST Protein) (off)', 'Fat', 'Iron', 'Create attribute…'])
})

test('a column with no unit offers no attribute', async () => {
  await mountPage()
  await waitFor(() => expect(choice('TEST Energy').options.length).toBe(3))
  expect([...choice('TEST Alcohol').options].map((option) => option.textContent)).toEqual(['Not mapped', 'Create attribute…'])
})

test('the mapped attribute is shown by name, an unmapped column says Not mapped', async () => {
  await mountPage()
  await entries('TEST Protein')
  expect(['TEST Energy', 'TEST Protein', 'TEST Vitamin D', 'TEST Alcohol'].map(shownChoice)).toEqual([
    'Not mapped',
    'Protein',
    'Not mapped',
    'Not mapped',
  ])
})

/** A PUT of column 2 that records its body and answers with the column mapped so. */
function putColumn2(puts: unknown[]): FakeServer {
  return {
    'PUT /api/data-sources/testsource/columns/2': (body) => {
      puts.push(body)
      return { body: { ...columns[1], attribute_id: (body as { attribute_id: number | null }).attribute_id } }
    },
  }
}

test('choosing an attribute saves at once, once, and the row shows it', async () => {
  const puts: unknown[] = []
  const { user } = await mountPage(putColumn2(puts))
  await entries('TEST Protein')
  await user.selectOptions(choice('TEST Protein'), 'Fat')
  await waitFor(() => expect(shownChoice('TEST Protein')).toBe('Fat'))
  expect(puts).toEqual([{ attribute_id: 2 }])
  // the other rows now see Fat as taken
  expect(await entries('TEST Vitamin D')).toEqual(['Not mapped', 'Protein', 'Fat (taken by TEST Protein) (off)', 'Iron', 'Create attribute…'])
})

test('Not mapped sends null', async () => {
  const puts: unknown[] = []
  const { user } = await mountPage(putColumn2(puts))
  await entries('TEST Protein')
  await user.selectOptions(choice('TEST Protein'), 'Not mapped')
  await waitFor(() => expect(shownChoice('TEST Protein')).toBe('Not mapped'))
  expect(puts).toEqual([{ attribute_id: null }])
})

test('the choice is disabled while its save runs, the others are not', async () => {
  let answer: (reply: FakeReply) => void = () => undefined
  const { user } = await mountPage({
    'PUT /api/data-sources/testsource/columns/2': () => new Promise<FakeReply>((resolve) => (answer = resolve)),
  })
  await entries('TEST Protein')
  await user.selectOptions(choice('TEST Protein'), 'Fat')
  await waitFor(() => expect(choice('TEST Protein').disabled).toBe(true))
  expect(choice('TEST Energy').disabled).toBe(false)
  answer({ body: { ...columns[1], attribute_id: 2 } })
  await waitFor(() => expect(choice('TEST Protein').disabled).toBe(false))
  expect(shownChoice('TEST Protein')).toBe('Fat')
})

test('a failed save says so and the choice keeps the stored value', async () => {
  const { user } = await mountPage({ 'PUT /api/data-sources/testsource/columns/2': 500 })
  await entries('TEST Protein')
  await user.selectOptions(choice('TEST Protein'), 'Fat')
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save the mapping.')
  expect(shownChoice('TEST Protein')).toBe('Protein')
  expect(choice('TEST Protein').getAttribute('aria-invalid')).toBe('true')
})

test('attribute_taken reloads the source, then says which column has it', async () => {
  const stale = { ...columns[2]!, attribute_id: null }
  let reads = 0
  const { user } = await mountPage({
    'GET /api/data-sources/testsource': () => {
      reads += 1
      // the reload shows that TEST Energy took Fat meanwhile
      const fresh: DataSource = { ...source, columns: [{ ...columns[0]!, attribute_id: 2 }, columns[1]!, stale, columns[3]!] }
      return { body: reads === 1 ? source : fresh }
    },
    'PUT /api/data-sources/testsource/columns/3': {
      status: 422,
      body: { detail: [{ loc: ['body', 'attribute_id'], type: 'attribute_taken', msg: 'Fat is already mapped from TEST Energy.' }] },
    },
  })
  await entries('TEST Vitamin D')
  await user.selectOptions(choice('TEST Vitamin D'), 'Fat')
  expect((await screen.findByRole('alert')).textContent).toBe('Fat is already mapped from TEST Energy.')
  expect(reads).toBe(2)
  expect(shownChoice('TEST Energy')).toBe('Fat')
  expect(shownChoice('TEST Vitamin D')).toBe('Not mapped')
})

test('unit_mismatch reloads the source, then says the units do not convert', async () => {
  let reads = 0
  const { user } = await mountPage({
    'GET /api/data-sources/testsource': () => {
      reads += 1
      return { body: source }
    },
    'PUT /api/data-sources/testsource/columns/2': {
      status: 422,
      body: { detail: [{ loc: ['body', 'attribute_id'], type: 'unit_mismatch', msg: 'no' }] },
    },
  })
  await entries('TEST Protein')
  await user.selectOptions(choice('TEST Protein'), 'Fat')
  expect((await screen.findByRole('alert')).textContent).toBe("TEST Protein and Fat don't convert.")
  expect(reads).toBe(2)
  expect(shownChoice('TEST Protein')).toBe('Protein')
})

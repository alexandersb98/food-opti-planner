import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeServer, field, mountApp, texts, type FakeServer } from '../test-app'
import { dataSource, sourceColumn } from '../test-data'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const columns = [
  sourceColumn({ id: 1, name: 'TEST Energy', unit: 'kcal' }),
  sourceColumn({ id: 2, name: 'TEST Protein', unit: 'g' }),
  sourceColumn({ id: 3, name: 'TEST Vitamin D', unit: 'µg' }),
  sourceColumn({ id: 4, name: 'TEST Alcohol', unit: '', withdrawn: true }),
]
const source = dataSource({ columns, column_count: 3 })

async function mountPage(server: FakeServer = {}) {
  fakeServer({
    'GET /api/session': 204,
    'GET /api/data-sources/testsource': { body: source },
    ...server,
  })
  return mountApp('/settings/data-sources/testsource')
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function colourInput(wrapper: Wrapper) {
  return field(wrapper, 'Colour')
}

test('the heading is the source name, with the version, import time and attribution', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('TEST Source')
  const text = wrapper.text()
  expect(text).toContain('Version')
  expect(text).toContain('2026-01-01')
  expect(text).toContain('Imported')
  expect(text).toContain(new Date('2026-01-01T12:00:00Z').toLocaleString())
  expect(text).toContain('TEST data, not real: for tests only.')
  wrapper.unmount()
})

test('without an attribution there is no attribution line', async () => {
  const { wrapper } = await mountPage({ 'GET /api/data-sources/testsource': { body: { ...source, attribution: null } } })
  expect(wrapper.text()).not.toContain('Attribution')
  wrapper.unmount()
})

test('the back arrow goes to Settings', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('a[aria-label="Back"]').attributes('href')).toBe('/settings')
  wrapper.unmount()
})

test('columns keep the server order, withdrawn last, greyed and marked', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.text()).toContain('3 columns')
  expect(texts(wrapper, '.column-row')).toEqual([
    'TEST Energykcal',
    'TEST Proteing',
    'TEST Vitamin Dµg',
    'TEST AlcoholNo longer in the source',
  ])
  const rows = wrapper.findAll('.column-row')
  expect(rows.map((row) => row.classes('text-grey-6'))).toEqual([false, false, false, true])
  wrapper.unmount()
})

test('the search narrows the columns by name, ignoring case, and keeps their order', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Search columns').setValue('T')
  expect(wrapper.findAll('.column-row')).toHaveLength(4)
  await field(wrapper, 'Search columns').setValue('PRO')
  expect(texts(wrapper, '.column-row')).toEqual(['TEST Proteing'])
  await field(wrapper, 'Search columns').setValue('vit')
  expect(texts(wrapper, '.column-row')).toEqual(['TEST Vitamin Dµg'])
  await field(wrapper, 'Search columns').setValue('zzz')
  expect(wrapper.findAll('.column-row')).toHaveLength(0)
  expect(wrapper.text()).toContain('No columns match.')
  wrapper.unmount()
})

test('the colour input shows the stored colour', async () => {
  const { wrapper } = await mountPage()
  expect(colourInput(wrapper).element.value).toBe('#1976d2')
  expect(colourInput(wrapper).attributes('type')).toBe('color')
  wrapper.unmount()
})

test('a chosen colour is saved once, on change, and shown', async () => {
  const patches: unknown[] = []
  const { wrapper } = await mountPage({
    'PATCH /api/data-sources/testsource': (body) => {
      patches.push(body)
      return { body: { ...source, ...(body as object) } }
    },
  })
  const input = colourInput(wrapper)
  // Dragging in the picker fires `input` events (setValue would also fire `change`).
  for (const dragged of ['#ff0000', '#ee0000']) {
    input.element.value = dragged
    await input.trigger('input')
  }
  expect(patches).toEqual([]) // nothing is sent until the picker closes
  await input.trigger('change')
  await flushPromises()
  expect(patches).toEqual([{ colour: '#ee0000' }])
  expect(colourInput(wrapper).element.value).toBe('#ee0000')
  wrapper.unmount()
})

test('a refused save says so and the input goes back to the stored colour', async () => {
  const { wrapper } = await mountPage({ 'PATCH /api/data-sources/testsource': { status: 422, body: { detail: [] } } })
  const input = colourInput(wrapper)
  await input.setValue('#ff0000')
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  expect(colourInput(wrapper).element.value).toBe('#1976d2')
  wrapper.unmount()
})

test('an unknown source shows the load message', async () => {
  const { wrapper } = await mountPage({ 'GET /api/data-sources/testsource': { status: 404, body: { detail: 'No such data source' } } })
  expect(wrapper.text()).toContain('Could not load the data source.')
  wrapper.unmount()
})

import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { resetPreferences } from '../preferences'
import { button, click, fakeServer, mountApp, type FakeServer } from '../test-app'
import { dataSourceSummary, preferences, unitCatalogue } from '../test-data'
import { resetUnits } from '../units'

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** A fake server whose PUT merges the change into the preferences it keeps. */
function server(overrides: FakeServer = {}) {
  let saved = preferences()
  const puts: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/units': { body: unitCatalogue() },
    'GET /api/preferences': () => ({ body: saved }),
    'GET /api/data-sources': { body: [] },
    'PUT /api/preferences': (body) => {
      puts.push(body)
      saved = { ...saved, ...(body as object) }
      return { body: saved }
    },
    ...overrides,
  })
  return { calls, puts }
}

async function mountPage() {
  const { wrapper } = await mountApp('/settings')
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>

/** The select labelled `label`. */
function select(wrapper: Wrapper, label: string) {
  const found = wrapper.findAll('.preferred-units-card .q-select').find((s) => s.text().includes(label))
  expect(found, `select ${label}`).toBeDefined()
  return found!
}

/** What the select shows as its value. */
function shown(wrapper: Wrapper, label: string) {
  return select(wrapper, label).get('.q-field__native').text()
}

/** Open the select and answer the texts of its options. */
async function open(wrapper: Wrapper, label: string) {
  await select(wrapper, label).get('.q-field__control').trigger('click')
  await flushPromises()
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)!
  return [...menu.querySelectorAll<HTMLElement>('.q-item')]
}

async function choose(wrapper: Wrapper, label: string, option: string) {
  const item = (await open(wrapper, label)).find((i) => i.textContent?.trim() === option)
  expect(item, `option ${option}`).toBeDefined()
  item!.click()
  await flushPromises()
}

test('the page has the heading and the Preferred units card', async () => {
  server()
  const wrapper = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Settings')
  const card = wrapper.get('.preferred-units-card')
  expect(card.text()).toContain('Preferred units')
  expect(card.text()).toContain(
    'Used for new ingredients and attributes, and for values copied from data sources. Changing it converts nothing already saved.',
  )
  expect([shown(wrapper, 'Mass'), shown(wrapper, 'Volume'), shown(wrapper, 'Energy')]).toEqual([
    'g (gram)',
    'dl (decilitre)',
    'kcal (kilocalorie)',
  ])
  wrapper.unmount()
})

test('Mass offers exactly the six mass units, in order', async () => {
  server()
  const wrapper = await mountPage()
  const items = await open(wrapper, 'Mass')
  expect(items.map((i) => i.textContent?.trim())).toEqual([
    'µg (microgram)',
    'mg (milligram)',
    'g (gram)',
    'kg (kilogram)',
    'oz (ounce)',
    'lb (pound)',
  ])
  wrapper.unmount()
})

test('choosing a unit saves just that key and shows it', async () => {
  const { puts } = server()
  const wrapper = await mountPage()
  await choose(wrapper, 'Mass', 'kg (kilogram)')
  expect(puts).toEqual([{ 'unit.mass': 'kg' }])
  expect(shown(wrapper, 'Mass')).toBe('kg (kilogram)')
  await choose(wrapper, 'Volume', 'msk (tablespoon)')
  await choose(wrapper, 'Energy', 'kJ (kilojoule)')
  expect(puts).toEqual([{ 'unit.mass': 'kg' }, { 'unit.volume': 'msk' }, { 'unit.energy': 'kJ' }])
  expect([shown(wrapper, 'Mass'), shown(wrapper, 'Volume'), shown(wrapper, 'Energy')]).toEqual([
    'kg (kilogram)',
    'msk (tablespoon)',
    'kJ (kilojoule)',
  ])
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})

test('a refused save shows the error and the old value', async () => {
  server({ 'PUT /api/preferences': { status: 422, body: { detail: [] } } })
  const wrapper = await mountPage()
  await choose(wrapper, 'Mass', 'kg (kilogram)')
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  expect(shown(wrapper, 'Mass')).toBe('g (gram)')
  wrapper.unmount()
})

test('a save that cannot reach the server shows the error, and a later save clears it', async () => {
  const { puts } = server()
  const wrapper = await mountPage()
  const fetchWorks = globalThis.fetch
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
  await choose(wrapper, 'Mass', 'kg (kilogram)')
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  expect(shown(wrapper, 'Mass')).toBe('g (gram)')
  vi.stubGlobal('fetch', fetchWorks)
  await choose(wrapper, 'Mass', 'kg (kilogram)')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(puts).toEqual([{ 'unit.mass': 'kg' }])
  wrapper.unmount()
})

test('a failed load shows the message, and Try again loads', async () => {
  let status = 500
  server({ 'GET /api/preferences': () => ({ status, body: preferences() }) })
  const wrapper = await mountPage()
  expect(wrapper.text()).toContain('Could not load the settings.')
  expect(wrapper.find('.preferred-units-card').exists()).toBe(false)
  status = 200
  await click(button(wrapper, 'Try again'))
  expect(wrapper.text()).not.toContain('Could not load the settings.')
  expect(shown(wrapper, 'Mass')).toBe('g (gram)')
  wrapper.unmount()
})

test('Settings opens from the menu', async () => {
  server()
  const { wrapper, router } = await mountApp('/')
  await wrapper.get('button[aria-label="Menu"]').trigger('click')
  const item = wrapper.findAll('.q-drawer .q-item').find((i) => i.text().includes('Settings'))
  await click(item!)
  expect(router.currentRoute.value.name).toBe('settings')
  expect(wrapper.get('h1').text()).toBe('Settings')
  wrapper.unmount()
})

test('a second visit reads the changed value without asking again', async () => {
  const { calls } = server()
  const first = await mountPage()
  await choose(first, 'Mass', 'kg (kilogram)')
  first.unmount()
  const second = await mountPage()
  expect(shown(second, 'Mass')).toBe('kg (kilogram)')
  expect(calls.filter((c) => c === 'GET /api/preferences')).toHaveLength(1)
  expect(calls.filter((c) => c === 'GET /api/units')).toHaveLength(1)
  second.unmount()
})

test('Volume and Energy offer their own units in order', async () => {
  server()
  const wrapper = await mountPage()
  const text = (items: HTMLElement[]) => items.map((i) => i.textContent?.trim())
  expect(text(await open(wrapper, 'Volume'))).toEqual([
    'ml (millilitre)',
    'cl (centilitre)',
    'dl (decilitre)',
    'l (litre)',
    'krm (kryddmått)',
    'tsk (teaspoon)',
    'msk (tablespoon)',
    'fl oz (fluid ounce)',
    'US cup (US cup)',
    'metric cup (metric cup)',
  ])
  expect(text(await open(wrapper, 'Energy'))).toEqual(['kJ (kilojoule)', 'kcal (kilocalorie)'])
  wrapper.unmount()
})

test('a failed units load alone shows the message, and Try again loads', async () => {
  let status = 500
  server({ 'GET /api/units': () => ({ status, body: unitCatalogue() }) })
  const wrapper = await mountPage()
  expect(wrapper.text()).toContain('Could not load the settings.')
  status = 200
  await click(button(wrapper, 'Try again'))
  expect(shown(wrapper, 'Energy')).toBe('kcal (kilocalorie)')
  wrapper.unmount()
})

test('two quick changes in different selects both save, in order', async () => {
  const { puts } = server()
  const wrapper = await mountPage()
  const first = open(wrapper, 'Mass').then((items) => items.find((i) => i.textContent?.trim() === 'kg (kilogram)')!.click())
  await first
  await choose(wrapper, 'Energy', 'kJ (kilojoule)')
  await flushPromises()
  expect(puts).toEqual([{ 'unit.mass': 'kg' }, { 'unit.energy': 'kJ' }])
  expect(shown(wrapper, 'Mass')).toBe('kg (kilogram)')
  expect(shown(wrapper, 'Energy')).toBe('kJ (kilojoule)')
  wrapper.unmount()
})

test('the Data sources card is on the page', async () => {
  server({ 'GET /api/data-sources': { body: [dataSourceSummary()] } })
  const wrapper = await mountPage()
  expect(wrapper.get('.data-sources-card').text()).toContain('TEST Source')
  wrapper.unmount()
})

test('when the data sources fail to load, Preferred units still works', async () => {
  const { puts } = server({ 'GET /api/data-sources': 500 })
  const wrapper = await mountPage()
  expect(wrapper.get('.data-sources-card').text()).toContain('Could not load the data sources.')
  await choose(wrapper, 'Mass', 'kg (kilogram)')
  expect(puts).toEqual([{ 'unit.mass': 'kg' }])
  wrapper.unmount()
})

test('when the preferences fail to load, the Data sources card still shows', async () => {
  server({ 'GET /api/preferences': 500, 'GET /api/data-sources': { body: [dataSourceSummary()] } })
  const wrapper = await mountPage()
  expect(wrapper.text()).toContain('Could not load the settings.')
  expect(wrapper.get('.data-sources-card').text()).toContain('TEST Source')
  wrapper.unmount()
})

import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { BASE_PATH } from '../../base'
import { EDITION_STORAGE_KEY } from '../../stores/edition'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'
import { dataSourceSummary, preferences, unitCatalogue } from '../../../test-data'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove()
})

const testSource = dataSourceSummary({ column_count: 55, mapped_count: 2 })
const other = dataSourceSummary({ key: 'other', name: 'TEST Other', colour: '#ff0000', food_count: 1, version: '2026-02-02' })

/** A fake server whose PUT merges the change into the preferences it keeps. */
function server(overrides: FakeServer = {}) {
  let saved = preferences()
  const puts: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/counts': { body: { recipes: 8, ingredients: 16, attributes: 5, tags: 6 } },
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

async function list(label: string) {
  return (await screen.findByLabelText(label)) as HTMLSelectElement
}

/** What the list shows as its value. */
async function shown(label: string) {
  const select = await list(label)
  return select.selectedOptions[0]?.textContent
}

async function optionTexts(label: string) {
  return [...(await list(label)).options].map((option) => option.textContent)
}

function dataSources() {
  return screen.getByRole('region', { name: 'Data sources' })
}

function where(router: Awaited<ReturnType<typeof mountApp>>['router']) {
  return router.state.location.pathname.slice(BASE_PATH.length)
}

test('the page has its heading, the edition and the preferred units', async () => {
  server()
  await mountApp('/settings')
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeDefined()
  const units = screen.getByRole('region', { name: 'Preferred units' })
  expect(units.textContent).toContain(
    'Used for new ingredients and attributes, and for values copied from data sources. Changing it converts nothing already saved.',
  )
  expect([await shown('Mass'), await shown('Volume'), await shown('Energy')]).toEqual([
    'g (gram)',
    'dl (decilitre)',
    'kcal (kilocalorie)',
  ])
  expect(within(screen.getByRole('group', { name: 'Edition' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Follow the device',
    'Paper',
    'Evening',
  ])
})

test('each list offers exactly its own units, in order', async () => {
  server()
  await mountApp('/settings')
  expect(await optionTexts('Mass')).toEqual(['µg (microgram)', 'mg (milligram)', 'g (gram)', 'kg (kilogram)', 'oz (ounce)', 'lb (pound)'])
  expect(await optionTexts('Volume')).toEqual([
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
  expect(await optionTexts('Energy')).toEqual(['kJ (kilojoule)', 'kcal (kilocalorie)'])
})

test('choosing a unit saves just that key through the preferences and shows it', async () => {
  const { puts } = server()
  const { user } = await mountApp('/settings')
  await user.selectOptions(await list('Mass'), 'kg')
  await waitFor(() => expect(puts).toEqual([{ 'unit.mass': 'kg' }]))
  expect(await shown('Mass')).toBe('kg (kilogram)')
  await user.selectOptions(await list('Volume'), 'msk')
  await user.selectOptions(await list('Energy'), 'kJ')
  await waitFor(() => expect(puts).toEqual([{ 'unit.mass': 'kg' }, { 'unit.volume': 'msk' }, { 'unit.energy': 'kJ' }]))
  await waitFor(async () => expect(await shown('Energy')).toBe('kJ (kilojoule)'))
  expect([await shown('Mass'), await shown('Volume')]).toEqual(['kg (kilogram)', 'msk (tablespoon)'])
  expect(screen.queryByRole('alert')).toBeNull()
})

test('two quick changes in different lists both save, in order', async () => {
  const { puts } = server()
  const { user } = await mountApp('/settings')
  const mass = await list('Mass')
  const energy = await list('Energy')
  await Promise.all([user.selectOptions(mass, 'kg'), user.selectOptions(energy, 'kJ')])
  await waitFor(() => expect(puts).toEqual([{ 'unit.mass': 'kg' }, { 'unit.energy': 'kJ' }]))
  await waitFor(async () => expect([await shown('Mass'), await shown('Energy')]).toEqual(['kg (kilogram)', 'kJ (kilojoule)']))
})

test('a refused save shows the error and the old value', async () => {
  server({ 'PUT /api/preferences': { status: 422, body: { detail: [] } } })
  const { user } = await mountApp('/settings')
  await user.selectOptions(await list('Mass'), 'kg')
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
  await waitFor(async () => expect(await shown('Mass')).toBe('g (gram)'))
})

test('a save that cannot reach the server shows the error, and a later save clears it', async () => {
  const { puts } = server()
  const { user } = await mountApp('/settings')
  const mass = await list('Mass')
  const fetchWorks = globalThis.fetch
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
  await user.selectOptions(mass, 'kg')
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
  await waitFor(async () => expect(await shown('Mass')).toBe('g (gram)'))
  vi.stubGlobal('fetch', fetchWorks)
  await user.selectOptions(mass, 'kg')
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(puts).toEqual([{ 'unit.mass': 'kg' }])
})

test('a failed preferences load shows the message, and Try again loads', async () => {
  let status = 500
  server({ 'GET /api/preferences': () => ({ status, body: preferences() }) })
  const { user } = await mountApp('/settings')
  const units = await screen.findByRole('region', { name: 'Preferred units' })
  expect((await within(units).findByRole('alert')).textContent).toContain('Could not load the settings.')
  expect(screen.queryByLabelText('Mass')).toBeNull()
  status = 200
  await user.click(within(units).getByRole('button', { name: 'Try again' }))
  expect(await shown('Mass')).toBe('g (gram)')
  expect(within(units).queryByRole('alert')).toBeNull()
})

test('a failed units load alone shows the message, and Try again loads', async () => {
  let status = 500
  server({ 'GET /api/units': () => ({ status, body: unitCatalogue() }) })
  const { user } = await mountApp('/settings')
  const units = await screen.findByRole('region', { name: 'Preferred units' })
  expect((await within(units).findByRole('alert')).textContent).toContain('Could not load the settings.')
  status = 200
  await user.click(within(units).getByRole('button', { name: 'Try again' }))
  expect(await shown('Energy')).toBe('kcal (kilocalorie)')
})

test('a second visit reads the changed value without asking again', async () => {
  const { calls, puts } = server()
  const { user, router } = await mountApp('/settings')
  await user.selectOptions(await list('Mass'), 'kg')
  await waitFor(() => expect(puts).toHaveLength(1))
  await router.navigate(BASE_PATH + '/tags')
  await router.navigate(BASE_PATH + '/settings')
  expect(await shown('Mass')).toBe('kg (kilogram)')
  expect(calls.filter((c) => c === 'GET /api/preferences')).toHaveLength(1)
  expect(calls.filter((c) => c === 'GET /api/units')).toHaveLength(1)
})

test('picking an edition sets the theme, keeps it on this device and turns the toolbar colour', async () => {
  for (const [scheme, colour] of [
    ['light', '#f4efe4'],
    ['dark', '#1a1714'],
  ]) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.media = `(prefers-color-scheme: ${scheme})`
    meta.content = colour
    document.head.append(meta)
  }
  server()
  const { user } = await mountApp('/settings')
  const edition = await screen.findByRole('group', { name: 'Edition' })
  const pick = (name: string) => within(edition).getByRole('button', { name })
  expect(pick('Follow the device').getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)

  await user.click(pick('Evening'))
  expect(pick('Evening').getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('evening')
  const media = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.media)
  expect(media()).toEqual(['not all', 'all'])

  await user.click(pick('Paper'))
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('paper')
  expect(media()).toEqual(['all', 'not all'])

  await user.click(pick('Follow the device'))
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull()
  expect(media()).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])
})

test('a stored edition is the one pressed', async () => {
  localStorage.setItem(EDITION_STORAGE_KEY, 'evening')
  server()
  await mountApp('/settings')
  const edition = await screen.findByRole('group', { name: 'Edition' })
  expect(within(edition).getByRole('button', { name: 'Evening' }).getAttribute('aria-pressed')).toBe('true')
})

test('with one language there is no language choice', async () => {
  server()
  await mountApp('/settings')
  await screen.findByRole('group', { name: 'Edition' })
  expect(screen.queryByRole('heading', { name: 'Language' })).toBeNull()
  expect(screen.queryByRole('group', { name: 'Language' })).toBeNull()
})

test('each data source is an entry with its colour, name, version, foods and mapped columns', async () => {
  server({ 'GET /api/data-sources': { body: [testSource, other] } })
  await mountApp('/settings')
  const links = await within(await screen.findByRole('region', { name: 'Data sources' })).findAllByRole('link')
  expect(links.map((link) => link.textContent)).toEqual([
    expect.stringMatching(/TEST Source\s*Version 2026-01-01 · 3 foods · 2 of 55 columns mapped/),
    expect.stringMatching(/TEST Other\s*Version 2026-02-02 · 1 food · 0 of 3 columns mapped/),
  ])
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    `${BASE_PATH}/settings/data-sources/testsource`,
    `${BASE_PATH}/settings/data-sources/other`,
  ])
  const dots = links.map((link) => link.querySelector<HTMLElement>('.settings-source-dot')!)
  expect(dots.map((dot) => dot.style.backgroundColor)).toEqual(['rgb(25, 118, 210)', 'rgb(255, 0, 0)'])
  expect(dots[0]!.getAttribute('aria-hidden')).toBe('true')
})

test('an entry opens the source page', async () => {
  server({
    'GET /api/data-sources': { body: [testSource, other] },
    'GET /api/data-sources/other': { body: { ...other, attribution: null, columns: [] } },
  })
  const { user, router } = await mountApp('/settings')
  await user.click(await screen.findByRole('link', { name: /TEST Other/ }))
  // a lazy route: the navigation ends once its page has loaded
  await waitFor(() => expect(where(router)).toBe('/settings/data-sources/other'), { timeout: 5000 })
})

test('with no data sources the part says so', async () => {
  server()
  await mountApp('/settings')
  await waitFor(() => expect(dataSources().textContent).toContain('No data sources loaded.'))
  expect(within(dataSources()).queryAllByRole('link')).toHaveLength(0)
})

test('failed data sources show their own message, Try again loads, and the units still work', async () => {
  let answer: number | { body: unknown } = 500
  const { puts } = server({ 'GET /api/data-sources': () => answer })
  const { user } = await mountApp('/settings')
  await waitFor(() => expect(within(dataSources()).getByRole('alert').textContent).toContain('Could not load the data sources.'))

  await user.selectOptions(await list('Mass'), 'kg')
  await waitFor(() => expect(puts).toEqual([{ 'unit.mass': 'kg' }]))

  answer = { body: [testSource] }
  await user.click(within(dataSources()).getByRole('button', { name: 'Try again' }))
  expect(await within(dataSources()).findAllByRole('link')).toHaveLength(1)
  expect(within(dataSources()).queryByRole('alert')).toBeNull()
})

test('when the preferences fail to load, the data sources still show', async () => {
  server({ 'GET /api/preferences': 500, 'GET /api/data-sources': { body: [testSource] } })
  await mountApp('/settings')
  expect(await screen.findByText('Could not load the settings.')).toBeDefined()
  expect(await within(dataSources()).findByRole('link', { name: /TEST Source/ })).toBeDefined()
})

import { afterEach, expect, test, vi } from 'vitest'
import { button, click, fakeServer, mountApp, texts } from '../test-app'
import { dataSourceSummary } from '../test-data'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const test_source = dataSourceSummary()
const other = dataSourceSummary({ key: 'other', name: 'TEST Other', colour: '#ff0000', food_count: 1, version: '2026-02-02' })

function routes(sources: unknown = [test_source, other]) {
  return {
    'GET /api/session': 204,
    'GET /api/units': { body: { groups: [], units: [] } },
    'GET /api/preferences': { body: {} },
    'GET /api/data-sources': typeof sources === 'number' ? sources : { body: sources },
  }
}

test('each source is a row with its colour, name, version and food count', async () => {
  fakeServer(routes())
  const { wrapper } = await mountApp('/settings')
  expect(wrapper.get('.data-sources-card').text()).toContain('Data sources')
  expect(texts(wrapper, '.source-row')).toEqual([
    expect.stringMatching(/TEST Source\s*Version 2026-01-01 · 3 foods/),
    expect.stringMatching(/TEST Other\s*Version 2026-02-02 · 1 food/),
  ])
  const dots = wrapper.findAll('.source-dot')
  expect(dots.map((dot) => dot.attributes('style'))).toEqual([
    expect.stringContaining('rgb(25, 118, 210)'),
    expect.stringContaining('rgb(255, 0, 0)'),
  ])
  expect(dots[0]!.attributes('aria-hidden')).toBe('true')
  wrapper.unmount()
})

test('a row opens the source page', async () => {
  fakeServer({ ...routes(), 'GET /api/data-sources/other': { body: { ...other, attribution: null, columns: [] } } })
  const { wrapper, router } = await mountApp('/settings')
  await click(wrapper.findAll('.source-row')[1]!)
  expect(router.currentRoute.value.path).toBe('/settings/data-sources/other')
  wrapper.unmount()
})

test('with no sources the card says so', async () => {
  fakeServer(routes([]))
  const { wrapper } = await mountApp('/settings')
  expect(wrapper.get('.data-sources-card').text()).toContain('No data sources loaded.')
  expect(wrapper.find('.source-row').exists()).toBe(false)
  wrapper.unmount()
})

test('a failing request shows the message and Retry loads again', async () => {
  let answer: number | { body: unknown } = 500
  fakeServer({ ...routes(), 'GET /api/data-sources': () => answer })
  const { wrapper } = await mountApp('/settings')
  const card = wrapper.get('.data-sources-card')
  expect(card.text()).toContain('Could not load the data sources.')

  answer = { body: [test_source] }
  await click(button(wrapper, 'Try again'))

  expect(wrapper.get('.data-sources-card').text()).not.toContain('Could not load')
  expect(texts(wrapper, '.source-row')).toHaveLength(1)
  wrapper.unmount()
})

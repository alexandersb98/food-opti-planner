import { afterEach, expect, test, vi } from 'vitest'
import type { TagFilter } from '../api/types'
import { button, click, fakeServer, mountApp, type FakeServer } from '../test-app'
import { plan, tag } from '../test-data'

const tags = [
  tag({ id: 1, name: 'vegetarian' }),
  tag({ id: 2, name: 'contains-nuts' }),
  tag({ id: 4, name: 'quick' }),
]
const stored = plan({ tag_filters: [{ tag_id: 2, mode: 'never' }] })

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** The usable count: total recipes less one per filter, out of 200. */
function countFor(body: unknown) {
  const filters = (body as { tag_filters: TagFilter[] }).tag_filters
  return { body: { usable: 200 - 58 * filters.length, total: 200 } }
}

async function mountPage(server: FakeServer = {}) {
  const asked: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: stored },
    'GET /api/tags': { body: tags },
    'POST /api/plan/recipe-count': (body) => {
      asked.push(body)
      return countFor(body)
    },
    ...server,
  })
  const { wrapper, router } = await mountApp('/plan/recipes')
  return { wrapper, router, calls, asked }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

/** The rows, each a tag's name and the mode selected. */
function rows(wrapper: Wrapper) {
  return wrapper.findAll('.filter-row').map((row) => [
    row.get('.tag-name').text(),
    row.get('.q-btn-toggle .bg-primary').text(),
  ])
}

async function choose(wrapper: Wrapper, tagName: string, mode: string) {
  const row = wrapper.findAll('.filter-row').find((r) => r.get('.tag-name').text() === tagName)!
  await click(row.findAll('.q-btn-toggle button').find((b) => b.text() === mode)!)
}

function countLine(wrapper: Wrapper) {
  return wrapper.get('.count-line')
}

test('one row per tag, in tag order, with the stored mode selected', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Recipe filters')
  expect(rows(wrapper)).toEqual([
    ['vegetarian', 'Any'],
    ['contains-nuts', 'Never'],
    ['quick', 'Any'],
  ])
  expect(countLine(wrapper).text()).toContain('142 of 200 recipes can be used')
  wrapper.unmount()
})

test('choosing a mode asks for the count again and shows it', async () => {
  const { wrapper, asked } = await mountPage()
  await choose(wrapper, 'vegetarian', 'Only')
  expect(asked.at(-1)).toEqual({
    tag_filters: [
      { tag_id: 1, mode: 'only' },
      { tag_id: 2, mode: 'never' },
    ],
  })
  expect(countLine(wrapper).text()).toContain('84 of 200 recipes can be used')
  await choose(wrapper, 'contains-nuts', 'Any')
  expect(asked.at(-1)).toEqual({ tag_filters: [{ tag_id: 1, mode: 'only' }] })
  expect(countLine(wrapper).text()).toContain('142 of 200 recipes can be used')
  wrapper.unmount()
})

test('the count line links to the Recipes page', async () => {
  const { wrapper, router } = await mountPage()
  await click(wrapper.findAll('a').find((link) => link.text() === 'Show recipes')!)
  expect(router.currentRoute.value.fullPath).toBe('/recipes')
  wrapper.unmount()
})

test('a count that fails says so', async () => {
  const { wrapper } = await mountPage({ 'POST /api/plan/recipe-count': 500 })
  expect(countLine(wrapper).text()).toContain('Could not count the recipes.')
  wrapper.unmount()
})

test('no usable recipe shows the count in red, and Save still works', async () => {
  const sent: unknown[] = []
  const { wrapper, router } = await mountPage({
    'POST /api/plan/recipe-count': { body: { usable: 0, total: 1 } },
    'PUT /api/plan': (body) => {
      sent.push(body)
      return { body: { ...stored, ...(body as object) } }
    },
  })
  expect(countLine(wrapper).text()).toContain('0 of 1 recipe can be used')
  expect(countLine(wrapper).classes()).toContain('text-negative')
  await click(button(wrapper, 'Save'))
  expect(sent).toHaveLength(1)
  expect(router.currentRoute.value.fullPath).toBe('/')
  wrapper.unmount()
})

test('Save sends the setup as loaded with the new filters and returns to the Plan page', async () => {
  const sent: unknown[] = []
  const { wrapper, router } = await mountPage({
    'PUT /api/plan': (body) => {
      sent.push(body)
      return { body: { ...stored, ...(body as object) } }
    },
  })
  await choose(wrapper, 'quick', 'Only')
  await choose(wrapper, 'vegetarian', 'Never')
  await choose(wrapper, 'contains-nuts', 'Any')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    {
      start_date: '2026-09-21',
      days: 7,
      meals: [
        { id: 1, name: 'Breakfast' },
        { id: 2, name: 'Lunch' },
        { id: 3, name: 'Dinner' },
      ],
      skips: [],
      minimums: [],
      goals: [],
      tag_filters: [
        { tag_id: 1, mode: 'never' },
        { tag_id: 4, mode: 'only' },
      ],
      solve_time_limit: 30,
    },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/')
  wrapper.unmount()
})

test('a refused save says so and stays', async () => {
  const { wrapper, router } = await mountPage({ 'PUT /api/plan': 422 })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  expect(router.currentRoute.value.fullPath).toBe('/plan/recipes')
  wrapper.unmount()
})

test('back leaves without saving', async () => {
  const { wrapper, router, calls } = await mountPage()
  await choose(wrapper, 'quick', 'Never')
  await click(wrapper.get('[aria-label="Back"]'))
  expect(router.currentRoute.value.fullPath).toBe('/')
  expect(calls).not.toContain('PUT /api/plan')
  wrapper.unmount()
})

test('with no tags, a hint and no Save', async () => {
  const { wrapper } = await mountPage({ 'GET /api/tags': { body: [] } })
  expect(wrapper.text()).toContain('No tags yet. Add them on the Tags page.')
  expect(wrapper.findAll('.filter-row')).toHaveLength(0)
  expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Save')
  wrapper.unmount()
})

test('a plan or tags that fail to load say so', async () => {
  for (const failing of ['GET /api/plan', 'GET /api/tags']) {
    const { wrapper } = await mountPage({ [failing]: 500 })
    expect(wrapper.text()).toContain('Could not load the plan.')
    wrapper.unmount()
    document.body.innerHTML = ''
  }
})

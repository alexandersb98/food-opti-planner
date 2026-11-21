import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { TagFilter } from '../../../api/types'
import { plan, tag } from '../../../test-data'
import { fakeServer, mountApp, type FakeReply, type FakeServer } from '../../test-app'

// Section 3 of the brief, the recipe filters, and its sheet. Ports the Vue
// RecipeFiltersPage and RecipesCard tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

const tags = [tag({ id: 1, name: 'vegetarian' }), tag({ id: 2, name: 'contains-nuts' }), tag({ id: 4, name: 'quick' })]
const stored = plan({ tag_filters: [{ tag_id: 2, mode: 'never' }] })

/** The usable count: 200 recipes less 58 per filter. */
function countFor(body: unknown): FakeReply {
  const filters = (body as { tag_filters: TagFilter[] }).tag_filters
  return { body: { usable: 200 - 58 * filters.length, total: 200 } }
}

async function mountBrief(server: FakeServer = {}, path = '/') {
  const asked: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: stored },
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: tags },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': (body) => {
      asked.push(body)
      return countFor(body)
    },
    ...server,
  })
  const app = await mountApp(path)
  // The brief is a lazy route: the first test loads it.
  await screen.findByRole('region', { name: 'Recipe filters' }, { timeout: 5000 })
  return { ...app, calls, asked }
}

function section() {
  return screen.getByRole('region', { name: 'Recipe filters' })
}

/** The rule tags' text. */
function rules() {
  return [...section().querySelectorAll('.filters-rules > li')].map((rule) => rule.textContent)
}

function usable() {
  return section().querySelector('.filters-usable:not(.filters-none)')!
}

async function openSheet(user: Awaited<ReturnType<typeof mountApp>>['user']) {
  await user.click(within(section()).getByRole('button', { name: 'Change the recipe filters' }))
  return screen.getByRole('dialog', { name: 'Recipe filters' })
}

/** The rows of the sheet: each tag's name and the mode pressed. */
function rows(sheet: HTMLElement) {
  return [...sheet.querySelectorAll('.filters-row')].map((row) => [
    row.querySelector('.filters-row-name')!.textContent,
    row.querySelector('[aria-pressed="true"]')!.textContent,
  ])
}

function preview(sheet: HTMLElement) {
  return sheet.querySelector('.filters-preview')!
}

/** A reply that waits until the test lets it go. */
function held() {
  let release!: (reply: FakeReply) => void
  const reply = new Promise<FakeReply>((resolve) => (release = resolve))
  return { reply, release: (answer: FakeReply) => release(answer) }
}

test('each filter is a rule tag, and the count says how many recipes can be used', async () => {
  await mountBrief({
    'GET /api/plan': {
      body: plan({
        tag_filters: [
          { tag_id: 1, mode: 'only' },
          { tag_id: 2, mode: 'never' },
        ],
      }),
    },
    'POST /api/plan/recipe-count': { body: { usable: 142, total: 200 } },
  })
  expect(rules()).toEqual(['Only: vegetarian', 'Never: contains-nuts'])
  expect(within(section()).getByRole('button', { name: 'Never: contains-nuts' }).getAttribute('aria-haspopup')).toBe('dialog')
  await waitFor(() => expect(usable().textContent).toContain('142 of 200 recipes can be used.'))
  expect(usable().classList.contains('filters-warn')).toBe(false)
  expect(usable().querySelector('[aria-live="polite"]')!.textContent).toBe('142 of 200 recipes can be used.')
})

test('without filters it says every recipe may be used', async () => {
  await mountBrief({ 'GET /api/plan': { body: plan({ tag_filters: [] }) } })
  expect(rules()).toEqual([])
  expect(section().textContent).toContain('No filters: every recipe may be used.')
  await waitFor(() => expect(usable().textContent).toContain('200 of 200 recipes can be used.'))
})

test('no usable recipe, or a count that fails, shows in the warning colour', async () => {
  await mountBrief({ 'POST /api/plan/recipe-count': { body: { usable: 0, total: 1 } } })
  await waitFor(() => expect(usable().textContent).toContain('0 of 1 recipe can be used.'))
  expect(usable().classList.contains('filters-warn')).toBe(true)
})

test('a count that fails says so', async () => {
  await mountBrief({ 'POST /api/plan/recipe-count': 500 })
  await waitFor(() => expect(usable().textContent).toContain('Could not count the recipes.'))
  expect(usable().classList.contains('filters-warn')).toBe(true)
})

test('See them goes to the recipe index', async () => {
  const { user, router } = await mountBrief()
  await user.click(within(section()).getByRole('link', { name: 'See them' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/recipes'))
})

test('Change opens the sheet with every tag in tag order and its mode', async () => {
  const { user } = await mountBrief()
  const sheet = await openSheet(user)
  expect(rows(sheet)).toEqual([
    ['vegetarian', 'Any'],
    ['contains-nuts', 'Never'],
    ['quick', 'Any'],
  ])
  expect(within(sheet).getByRole('group', { name: 'Filter for quick' })).toBeDefined()
  await waitFor(() => expect(preview(sheet).textContent).toBe('142 of 200 recipes can be used.'))
  expect(preview(sheet).getAttribute('aria-live')).toBe('polite')
})

test('a rule tag opens the sheet too, and closing gives it focus back', async () => {
  const { user } = await mountBrief()
  const rule = within(section()).getByRole('button', { name: 'Never: contains-nuts' })
  await user.click(rule)
  const sheet = screen.getByRole('dialog', { name: 'Recipe filters' })
  await user.click(within(sheet).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(rule)
})

test('choosing modes asks for the count again and shows it', async () => {
  const { user, asked } = await mountBrief()
  const sheet = await openSheet(user)
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for vegetarian' })).getByRole('button', { name: 'Only' }))
  expect(asked.at(-1)).toEqual({
    tag_filters: [
      { tag_id: 1, mode: 'only' },
      { tag_id: 2, mode: 'never' },
    ],
  })
  await waitFor(() => expect(preview(sheet).textContent).toBe('84 of 200 recipes can be used.'))
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for contains-nuts' })).getByRole('button', { name: 'Any' }))
  expect(asked.at(-1)).toEqual({ tag_filters: [{ tag_id: 1, mode: 'only' }] })
  await waitFor(() => expect(preview(sheet).textContent).toBe('142 of 200 recipes can be used.'))
  expect(rows(sheet)).toEqual([
    ['vegetarian', 'Only'],
    ['contains-nuts', 'Any'],
    ['quick', 'Any'],
  ])
})

test('an answer that arrives after a later one is dropped', async () => {
  const late = held()
  let question = 0
  const { user } = await mountBrief({
    'POST /api/plan/recipe-count': (body) => {
      question++
      // The brief's own count first, then the sheet's first question waits.
      return question === 2 ? late.reply : countFor(body)
    },
  })
  const sheet = await openSheet(user)
  await waitFor(() => expect(preview(sheet).textContent).toBe('142 of 200 recipes can be used.'))
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for quick' })).getByRole('button', { name: 'Never' }))
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for vegetarian' })).getByRole('button', { name: 'Never' }))
  await waitFor(() => expect(preview(sheet).textContent).toBe('26 of 200 recipes can be used.'))
  late.release({ body: { usable: 99, total: 200 } })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(preview(sheet).textContent).toBe('26 of 200 recipes can be used.')
})

test('no usable recipe in the sheet says to loosen a filter', async () => {
  const { user } = await mountBrief({
    'POST /api/plan/recipe-count': (body) =>
      (body as { tag_filters: TagFilter[] }).tag_filters.length > 1 ? { body: { usable: 0, total: 200 } } : countFor(body),
  })
  const sheet = await openSheet(user)
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for quick' })).getByRole('button', { name: 'Only' }))
  await waitFor(() =>
    expect(preview(sheet).textContent).toBe('No recipe fits these filters. Loosen one, or there will be no plan.'),
  )
  expect(preview(sheet).classList.contains('filters-warn')).toBe(true)
})

test('with no tags, the sheet points to the Tags page and has no Done', async () => {
  const { user, router } = await mountBrief({ 'GET /api/tags': { body: [] }, 'GET /api/plan': { body: plan() } })
  const sheet = await openSheet(user)
  expect(sheet.textContent).toContain('No tags yet. Add them on the Tags page, then come back to filter by them.')
  expect(within(sheet).queryByRole('button', { name: 'Done' })).toBeNull()
  await user.click(within(sheet).getByRole('link', { name: 'Tags page' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/tags'))
})

test('Done sends the new filters with the rest of the setup unchanged', async () => {
  const sent: unknown[] = []
  const { user } = await mountBrief({
    'PUT /api/plan': (body) => {
      sent.push(body)
      return { body: { ...stored, ...(body as object) } }
    },
  })
  const sheet = await openSheet(user)
  const choose = (name: string, mode: string) =>
    user.click(within(within(sheet).getByRole('group', { name: `Filter for ${name}` })).getByRole('button', { name: mode }))
  await choose('quick', 'Only')
  await choose('vegetarian', 'Never')
  await choose('contains-nuts', 'Any')
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
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
  expect(rules()).toEqual(['Never: vegetarian', 'Only: quick'])
  // The section's count follows the saved filters.
  await waitFor(() => expect(usable().textContent).toContain('84 of 200 recipes can be used.'))
  // Focus went back to Change.
  expect(document.activeElement).toBe(within(section()).getByRole('button', { name: 'Change the recipe filters' }))
})

test('Done without a change saves nothing', async () => {
  const { user, calls } = await mountBrief()
  const sheet = await openSheet(user)
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls).not.toContain('PUT /api/plan')
})

test('closing without Done keeps the filters, and the next opening starts from them', async () => {
  const { user, calls } = await mountBrief()
  let sheet = await openSheet(user)
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for quick' })).getByRole('button', { name: 'Never' }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls).not.toContain('PUT /api/plan')
  sheet = await openSheet(user)
  expect(rows(sheet)).toEqual([
    ['vegetarian', 'Any'],
    ['contains-nuts', 'Never'],
    ['quick', 'Any'],
  ])
})

test('a failed save says so and the sheet stays open', async () => {
  const { user } = await mountBrief({ 'PUT /api/plan': 500 })
  const sheet = await openSheet(user)
  await user.click(within(within(sheet).getByRole('group', { name: 'Filter for quick' })).getByRole('button', { name: 'Only' }))
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
  expect((await within(sheet).findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(screen.getByRole('dialog', { name: 'Recipe filters' })).toBe(sheet)
  expect(within(sheet).getByRole('button', { name: 'Done' })).toHaveProperty('disabled', false)
  expect(rules()).toEqual(['Never: contains-nuts'])
})

test('/plan/recipes opens the brief with the sheet, and the address loses the parameter', async () => {
  const { router } = await mountBrief({}, '/plan/recipes')
  expect(screen.getByRole('dialog', { name: 'Recipe filters' })).toBeDefined()
  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(router.state.location.pathname).toBe('/')
})

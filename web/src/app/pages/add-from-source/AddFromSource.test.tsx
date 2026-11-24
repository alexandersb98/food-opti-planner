import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { dataSourceSummary, foodPreview, foodSummary, ingredient, preferences } from '../../../test-data'
import { fakeServer, mountApp, type FakeReply, type FakeServer } from '../../test-app'

// Add from data source, opened from the Ingredients page's add menu. A port
// of the Vue AddFromSourceDialog tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

const sourceA = dataSourceSummary({ key: 'a', name: 'Source A' })
const sourceB = dataSourceSummary({ key: 'b', name: 'Source B', colour: '#ff0000' })
const oats = foodSummary({ id: 1, name: 'TEST Oats', groups: ['TEST Grains', 'TEST Other'] })
const milk = foodSummary({ id: 2, name: 'TEST Milk', groups: ['TEST Dairy'] })

const foodsPath = 'GET /api/data-sources/a/foods'
const oatsPath = 'GET /api/data-sources/a/foods/1'

function page(foods: unknown[], total = foods.length): FakeReply {
  return { body: { foods, total, offset: 0, limit: 20 } }
}

const preview = foodPreview({
  id: 1,
  source: { key: 'a', name: 'Source A', colour: '#1976d2' },
  values: [{ attribute_id: 1, attribute_name: 'Energy', attribute_unit: 'kcal', column_name: 'TEST Energy', value: '389' }],
  groups: [
    { tag_id: 5, name: 'TEST Grains' },
    { tag_id: 6, name: 'TEST Other' },
  ],
})

/** The server, whose handlers may read the latest call's query with
 * `last()` (the fake server passes them only the body). */
function serve(routes: FakeServer = {}) {
  const calls: string[] = fakeServer({
    'GET /api/session': 204,
    'GET /api/ingredients': { body: [] },
    'GET /api/attributes': { body: [] },
    'GET /api/data-sources': { body: [sourceA, sourceB] },
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': (body) => ({ body: preferences(body as object) }),
    [foodsPath]: page([oats]),
    [oatsPath]: { body: preview },
    ...routes,
  })
  return calls
}

/** The query of the latest call, e.g. "search=oat&offset=0". */
const queryOf = (call: string | undefined) => (call ?? '').split('?')[1] ?? ''
const searches = (calls: string[]) => calls.filter((call) => /\/foods\?/.test(call)).map(queryOf)

/** The Ingredients page with the sheet opened from its add menu. */
async function openSheet(routes: FakeServer = {}) {
  const calls = serve(routes)
  const app = await mountApp('/ingredients')
  await app.user.click(await screen.findByRole('button', { name: 'Add an ingredient' }))
  await app.user.click(screen.getByRole('button', { name: 'Add from data source' }))
  const sheet = await screen.findByRole('dialog', { name: 'Add from data source' }, { timeout: 3000 })
  return { ...app, calls, sheet }
}

/** The foods listed, as "name | groups". */
function rows(sheet: HTMLElement) {
  const list = sheet.querySelector('.afs-results:not([hidden]) ul')
  if (!list) return []
  return within(list as HTMLElement)
    .queryAllByRole('button')
    .map((row) => [...row.children].map((part) => part.textContent).join(' | '))
}

async function listed(sheet: HTMLElement, expected: string[]) {
  await waitFor(() => expect(rows(sheet)).toEqual(expected))
}

const sourceSelect = (sheet: HTMLElement) => within(sheet).getByRole('combobox', { name: 'Data source' }) as HTMLSelectElement
const searchBox = (sheet: HTMLElement) => within(sheet).queryByRole('searchbox', { name: 'Search foods' }) as HTMLInputElement | null
const nameBox = (sheet: HTMLElement) => within(sheet).getByRole('textbox', { name: 'Name' }) as HTMLInputElement
const pause = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)))

async function chooseOats(app: Awaited<ReturnType<typeof openSheet>>) {
  await app.user.click(await within(app.sheet).findByRole('button', { name: /^TEST Oats/ }))
  await within(app.sheet).findByRole('textbox', { name: 'Name' })
}

test('the add menu offers Add from data source, which opens the full-screen sheet', async () => {
  const { sheet } = await openSheet()
  expect(sheet.className).toContain('sheet-full')
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other'])
})

test('opens with the remembered source selected', async () => {
  const { sheet } = await openSheet({
    'GET /api/preferences': { body: preferences({ last_data_source: 'b' }) },
    'GET /api/data-sources/b/foods': page([milk]),
  })
  await listed(sheet, ['TEST Milk | TEST Dairy'])
  expect(sourceSelect(sheet).value).toBe('b')
})

test.each([null, 'gone'])('opens with the first source when %j is remembered', async (remembered) => {
  const { sheet } = await openSheet({ 'GET /api/preferences': { body: preferences({ last_data_source: remembered }) } })
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other'])
  expect(sourceSelect(sheet).value).toBe('a')
})

test('changing the source saves it once and clears the results', async () => {
  const bodies: unknown[] = []
  const { sheet, user } = await openSheet({
    'PUT /api/preferences': (body) => {
      bodies.push(body)
      return { body: preferences(body as object) }
    },
    'GET /api/data-sources/b/foods': page([]),
  })
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other'])
  await user.selectOptions(sourceSelect(sheet), 'b')
  expect(await within(sheet).findByText('No foods match.')).toBeDefined()
  expect(rows(sheet)).toEqual([])
  expect(bodies).toEqual([{ last_data_source: 'b' }])
})

test('a failing save of the source changes nothing visible', async () => {
  const { sheet, user } = await openSheet({ 'PUT /api/preferences': 500, 'GET /api/data-sources/b/foods': page([milk]) })
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other'])
  await user.selectOptions(sourceSelect(sheet), 'b')
  await listed(sheet, ['TEST Milk | TEST Dairy'])
  expect(sourceSelect(sheet).value).toBe('b')
})

test('the first foods list on open with their groups, before anything is typed', async () => {
  const { sheet, calls } = await openSheet({ [foodsPath]: page([oats, milk]) })
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other', 'TEST Milk | TEST Dairy'])
  expect(searches(calls)[0]).toBe('search=&offset=0')
  expect(within(sheet).getByRole('status').textContent).toBe('2 foods')
})

test('typing sends one search after the pause, from the first page', async () => {
  let calls: string[] = []
  const app = await openSheet({ [foodsPath]: () => page(queryOf(calls.at(-1)).startsWith('search=oat&') ? [oats] : [oats, milk]) })
  calls = app.calls
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other', 'TEST Milk | TEST Dairy'])
  const before = searches(calls).length
  await app.user.type(searchBox(app.sheet)!, 'oat')
  expect(searches(calls)).toHaveLength(before)
  await pause()
  expect(searches(calls).slice(before)).toEqual(['search=oat&offset=0'])
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other'])
})

test('a late reply to an older search never replaces a newer one', async () => {
  let release: (reply: FakeReply) => void = () => {}
  const slow = new Promise<FakeReply>((resolve) => (release = resolve))
  let calls: string[] = []
  const app = await openSheet({
    [foodsPath]: () => {
      const search = queryOf(calls.at(-1))
      if (search.startsWith('search=a&')) return slow
      return page(search.startsWith('search=b&') ? [milk] : [oats])
    },
  })
  calls = app.calls
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other'])
  const box = searchBox(app.sheet)!
  await app.user.type(box, 'a')
  await pause()
  await app.user.clear(box)
  await app.user.type(box, 'b')
  await pause()
  await listed(app.sheet, ['TEST Milk | TEST Dairy'])
  await act(async () => release(page([oats])))
  await pause()
  expect(rows(app.sheet)).toEqual(['TEST Milk | TEST Dairy'])
})

test('Show more appends the next 20 and goes when all are shown', async () => {
  const twenty = Array.from({ length: 20 }, (_, i) => foodSummary({ id: 100 + i, name: `Food ${i}` }))
  let calls: string[] = []
  const app = await openSheet({
    [foodsPath]: () =>
      queryOf(calls.at(-1)).endsWith('offset=20')
        ? { body: { foods: [milk], total: 21, offset: 20, limit: 20 } }
        : { body: { foods: twenty, total: 21, offset: 0, limit: 20 } },
  })
  calls = app.calls
  await waitFor(() => expect(rows(app.sheet)).toHaveLength(20))
  expect(within(app.sheet).getByRole('status').textContent).toBe('20 of 21 foods')
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Show more' }))
  await waitFor(() => expect(rows(app.sheet)).toHaveLength(21))
  expect(searches(calls).at(-1)).toBe('search=&offset=20')
  expect(rows(app.sheet).at(-1)).toContain('TEST Milk')
  expect(within(app.sheet).queryByRole('button', { name: 'Show more' })).toBeNull()
  expect(within(app.sheet).getByRole('status').textContent).toBe('21 foods')
})

test('a Show more still out when a new search answers is dropped', async () => {
  const twenty = Array.from({ length: 20 }, (_, i) => foodSummary({ id: 100 + i, name: `Food ${i}` }))
  let release: (reply: FakeReply) => void = () => {}
  const slow = new Promise<FakeReply>((resolve) => (release = resolve))
  let calls: string[] = []
  const app = await openSheet({
    [foodsPath]: () => {
      const search = queryOf(calls.at(-1))
      if (search.endsWith('offset=20')) return slow
      return search.startsWith('search=b&') ? page([milk]) : { body: { foods: twenty, total: 21, offset: 0, limit: 20 } }
    },
  })
  calls = app.calls
  await waitFor(() => expect(rows(app.sheet)).toHaveLength(20))
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Show more' }))
  await app.user.type(searchBox(app.sheet)!, 'b')
  await pause()
  await listed(app.sheet, ['TEST Milk | TEST Dairy'])
  await act(async () => release({ body: { foods: [oats], total: 21, offset: 20, limit: 20 } }))
  await pause()
  expect(rows(app.sheet)).toEqual(['TEST Milk | TEST Dairy'])
})

test('with no match the list says so', async () => {
  const { sheet } = await openSheet({ [foodsPath]: page([]) })
  expect(await within(sheet).findByText('No foods match.')).toBeDefined()
})

test('choosing a food shows the ingredient to be made', async () => {
  const app = await openSheet()
  await chooseOats(app)
  const { sheet } = app
  expect(within(sheet).getByRole('heading', { level: 3, name: 'TEST Oats' })).toBe(document.activeElement)
  expect(within(sheet).getByText('From Source A')).toBeDefined()
  expect(nameBox(sheet).value).toBe('TEST Oats')
  expect(within(sheet).getByText('Measured in g, values per 100 g')).toBeDefined()
  const value = within(sheet).getByRole('term')
  expect(value.textContent).toBe('Energy')
  expect(value.nextElementSibling?.textContent).toBe('389 kcal')
  expect(sheet.textContent).not.toContain('Not copied')
  expect(sheet.textContent).not.toContain('You already have')
  const tags = within(within(sheet).getByRole('group', { name: 'Tags' })).getAllByRole('button')
  expect(tags.map((tag) => [tag.textContent, tag.getAttribute('aria-pressed')])).toEqual([
    ['TEST Grains', 'true'],
    ['TEST Other', 'true'],
  ])
  expect(searchBox(sheet)).toBeNull()
})

test('a tag toggles off and on', async () => {
  const app = await openSheet()
  await chooseOats(app)
  const grains = within(app.sheet).getByRole('button', { name: 'TEST Grains' })
  await app.user.click(grains)
  expect(grains.getAttribute('aria-pressed')).toBe('false')
  await app.user.click(grains)
  expect(grains.getAttribute('aria-pressed')).toBe('true')
})

test('what was not copied and an earlier ingredient from the food are shown', async () => {
  const app = await openSheet({
    [oatsPath]: { body: { ...preview, skipped: ['Iron', 'Zinc'], existing: [{ id: 3, name: 'Havregryn' }, { id: 4, name: 'Oats too' }] } },
  })
  await chooseOats(app)
  expect(within(app.sheet).getByText('Not copied: Iron, Zinc')).toBeDefined()
  expect(within(app.sheet).getByText('You already have an ingredient from this food: Havregryn, Oats too')).toBeDefined()
})

test('a food with no mapped values says so and can still be added', async () => {
  const posts: unknown[] = []
  const app = await openSheet({
    [oatsPath]: { body: { ...preview, values: [] } },
    'POST /api/ingredients/from-source': (body) => {
      posts.push(body)
      return { status: 201, body: ingredient({ id: 9, name: 'TEST Oats' }) }
    },
  })
  await chooseOats(app)
  expect(within(app.sheet).getByText('No columns are mapped for this source yet. Map them on the data source page.')).toBeDefined()
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Add' }))
  await waitFor(() => expect(posts).toHaveLength(1))
})

test('Add posts the food, the edited name and the tags left on, then opens the ingredient', async () => {
  const posts: unknown[] = []
  const app = await openSheet({
    'POST /api/ingredients/from-source': (body) => {
      posts.push(body)
      return { status: 201, body: ingredient({ id: 9, name: 'Source oats' }) }
    },
  })
  await chooseOats(app)
  const name = nameBox(app.sheet)
  await app.user.clear(name)
  await app.user.type(name, 'Source oats')
  await app.user.click(within(app.sheet).getByRole('button', { name: 'TEST Other' }))
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Add' }))
  await waitFor(() => expect(app.router.state.location.pathname).toBe('/ingredients/9'))
  expect(posts).toEqual([{ food_id: 1, name: 'Source oats', tag_ids: [5] }])
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add from data source' })).toBeNull())
})

test('a second click while adding sends nothing more', async () => {
  let release: (reply: FakeReply) => void = () => {}
  const slow = new Promise<FakeReply>((resolve) => (release = resolve))
  const app = await openSheet({ 'POST /api/ingredients/from-source': () => slow })
  await chooseOats(app)
  const add = within(app.sheet).getByRole('button', { name: 'Add' })
  await app.user.click(add)
  await app.user.click(add)
  expect(app.calls.filter((call) => call.startsWith('POST'))).toHaveLength(1)
  expect(add.getAttribute('aria-busy')).toBe('true')
  await act(async () => release({ status: 201, body: ingredient({ id: 9, name: 'X' }) }))
})

test('a name in use shows under Name and the sheet stays', async () => {
  const app = await openSheet({
    'POST /api/ingredients/from-source': { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] } },
  })
  await chooseOats(app)
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Add' }))
  expect((await within(app.sheet).findByRole('alert')).textContent).toContain('An ingredient with this name already exists.')
  const name = nameBox(app.sheet)
  expect(name.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(name)
  expect(app.router.state.location.pathname).toBe('/ingredients')
})

test('a withdrawn food is refused with its text and the preview is loaded again', async () => {
  let withdrawn = false
  const app = await openSheet({
    [oatsPath]: () => ({ body: { ...preview, withdrawn } }),
    'POST /api/ingredients/from-source': () => {
      withdrawn = true
      return { status: 422, body: { detail: [{ loc: ['body', 'food_id'], type: 'withdrawn', msg: 'gone' }] } }
    },
  })
  await chooseOats(app)
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Add' }))
  expect((await within(app.sheet).findByRole('alert')).textContent).toContain('This food is no longer in the source.')
  expect(app.calls.filter((call) => call === 'GET /api/data-sources/a/foods/1')).toHaveLength(2)
  expect(within(app.sheet).getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)
})

test('any other failure of Add shows the save failure', async () => {
  const app = await openSheet({ 'POST /api/ingredients/from-source': 500 })
  await chooseOats(app)
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Add' }))
  expect((await within(app.sheet).findByRole('alert')).textContent).toContain('Could not save. Try again.')
})

test('an empty name asks for one and sends nothing', async () => {
  const app = await openSheet()
  await chooseOats(app)
  const name = nameBox(app.sheet)
  await app.user.clear(name)
  await app.user.type(name, '  ')
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Add' }))
  expect((await within(app.sheet).findByRole('alert')).textContent).toContain('Enter a name.')
  expect(document.activeElement).toBe(name)
  expect(app.calls.filter((call) => call.startsWith('POST'))).toHaveLength(0)
})

test('Back to results returns to the list with the search kept and focus on the food', async () => {
  const app = await openSheet()
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other'])
  await app.user.type(searchBox(app.sheet)!, 'oat')
  await pause()
  await chooseOats(app)
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Back to results' }))
  expect(searchBox(app.sheet)!.value).toBe('oat')
  expect(rows(app.sheet)).toHaveLength(1)
  expect(document.activeElement).toBe(within(app.sheet).getByRole('button', { name: /^TEST Oats/ }))
})

test('a failing search shows its message and Try again repeats it', async () => {
  let answer: FakeReply = 500
  const { sheet, user } = await openSheet({ [foodsPath]: () => answer })
  const alert = await within(sheet).findByRole('alert')
  expect(alert.textContent).toContain('Could not load the foods.')
  answer = page([oats])
  await user.click(within(alert).getByRole('button', { name: 'Try again' }))
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other'])
  expect(sheet.textContent).not.toContain('Could not load the foods.')
})

test('a failing preview shows its message and Try again repeats it', async () => {
  let answer: FakeReply = 500
  const app = await openSheet({ [oatsPath]: () => answer })
  await app.user.click(await within(app.sheet).findByRole('button', { name: /^TEST Oats/ }))
  const alert = await within(app.sheet).findByRole('alert')
  expect(alert.textContent).toContain('Could not load the food.')
  answer = { body: preview }
  await app.user.click(within(alert).getByRole('button', { name: 'Try again' }))
  expect((await within(app.sheet).findByRole('textbox', { name: 'Name' })).getAttribute('value')).toBe('TEST Oats')
})

test('with no data sources it says so', async () => {
  const { sheet } = await openSheet({ 'GET /api/data-sources': { body: [] } })
  expect(await within(sheet).findByText('No data sources loaded.')).toBeDefined()
  expect(searchBox(sheet)).toBeNull()
})

test('closing with a search pause and a reply pending sends nothing more', async () => {
  let release: (reply: FakeReply) => void = () => {}
  const slow = new Promise<FakeReply>((resolve) => (release = resolve))
  let calls: string[] = []
  const app = await openSheet({ [foodsPath]: () => (queryOf(calls.at(-1)).startsWith('search=x&') ? slow : page([oats])) })
  calls = app.calls
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other'])
  const box = searchBox(app.sheet)!
  await app.user.type(box, 'x')
  await pause() // the search is sent and waits for its reply
  await app.user.type(box, 'y') // and another one waits for its pause
  const sent = calls.length
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await act(async () => release(page([milk])))
  await pause()
  expect(calls).toHaveLength(sent)
})

test('clearing the search box searches for everything', async () => {
  let calls: string[] = []
  const app = await openSheet()
  calls = app.calls
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other'])
  const box = searchBox(app.sheet)!
  await app.user.type(box, 'oat')
  await pause()
  await app.user.clear(box)
  await pause()
  expect(searches(calls).at(-1)).toBe('search=&offset=0')
})

test('reopening starts afresh, and closing gives focus back to the add menu', async () => {
  const app = await openSheet()
  await listed(app.sheet, ['TEST Oats | TEST Grains, TEST Other'])
  await app.user.type(searchBox(app.sheet)!, 'oat')
  await pause()
  await chooseOats(app)
  await app.user.click(within(app.sheet).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const toggle = screen.getByRole('button', { name: 'Add an ingredient' })
  expect(document.activeElement).toBe(toggle)

  await app.user.click(toggle)
  await app.user.click(screen.getByRole('button', { name: 'Add from data source' }))
  const sheet = await screen.findByRole('dialog', { name: 'Add from data source' })
  await listed(sheet, ['TEST Oats | TEST Grains, TEST Other'])
  expect(searchBox(sheet)!.value).toBe('')
  expect(within(sheet).queryByRole('textbox', { name: 'Name' })).toBeNull()
  expect(searches(app.calls).at(-1)).toBe('search=&offset=0')
})

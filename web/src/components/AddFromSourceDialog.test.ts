import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { Quasar, QSelect } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { makeRouter } from '../router'
import { dialog } from '../test-app'
import { dataSourceSummary, foodPreview, foodSummary, ingredient, preferences } from '../test-data'
import AddFromSourceDialog from './AddFromSourceDialog.vue'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetPreferences()
})

type Reply = number | { status?: number; body?: unknown }
interface Call {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
}

const sourceA = dataSourceSummary({ key: 'a', name: 'Source A' })
const sourceB = dataSourceSummary({ key: 'b', name: 'Source B', colour: '#ff0000' })
const oats = foodSummary({ id: 1, name: 'TEST Oats', groups: ['TEST Grains', 'TEST Other'] })
const milk = foodSummary({ id: 2, name: 'TEST Milk', groups: ['TEST Dairy'] })

/** A fake server that sees the query too. `routes` map "METHOD /path" to a reply
 * or a function of the call; anything else is 404. */
function server(routes: Record<string, Reply | ((call: Call) => Reply | Promise<Reply>)>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    const url = new URL(request.url)
    const text = await request.text()
    const call = { method: request.method, path: url.pathname, query: url.searchParams, body: text ? JSON.parse(text) : undefined }
    calls.push(call)
    const route = routes[`${call.method} ${call.path}`] ?? 404
    const reply = typeof route === 'function' ? await route(call) : route
    const { status = 200, body = {} } = typeof reply === 'number' ? { status: reply } : reply
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return calls
}

function page(foods: unknown[], total = foods.length) {
  return { body: { foods, total, offset: 0, limit: 20 } }
}

const base = {
  'GET /api/data-sources': { body: [sourceA, sourceB] },
  'GET /api/preferences': { body: preferences() },
  'PUT /api/preferences': (call: Call) => ({ body: preferences(call.body as object) }),
}

async function mountDialog() {
  const router = makeRouter(createMemoryHistory())
  await router.push('/ingredients')
  const wrapper = mount(AddFromSourceDialog, {
    props: { modelValue: false },
    global: { plugins: [Quasar, makeI18n(), router] },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return { wrapper, router }
}

const wait = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
  await flushPromises()
}

function rows() {
  return [...document.querySelectorAll('.q-dialog .food-row')].map((row) =>
    [...row.querySelectorAll('.q-item__label')].map((label) => label.textContent?.trim()).join(' | '),
  )
}

function select(wrapper: VueWrapper) {
  return wrapper.getComponent(QSelect)
}

function searchInput() {
  return document.querySelector<HTMLInputElement>('.q-dialog input[aria-label="Search foods"]')!
}

async function type(text: string) {
  const input = searchInput()
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

function nameInput() {
  return document.querySelector<HTMLInputElement>('.q-dialog .food-name input')!
}

function text() {
  return dialog().text.replace(/\s+/g, ' ')
}

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.q-dialog button')].find((b) => b.textContent?.trim() === label)
  expect(found, `button ${label}`).toBeDefined()
  return found!
}

async function click(label: string) {
  button(label).click()
  await flushPromises()
}

async function chooseOats() {
  document.querySelector<HTMLElement>('.q-dialog .food-row')!.click()
  await flushPromises()
}

const foodsPath = 'GET /api/data-sources/a/foods'
const oatsPath = 'GET /api/data-sources/a/foods/1'

test('opens with the remembered source selected', async () => {
  server({ ...base, 'GET /api/preferences': { body: preferences({ last_data_source: 'b' }) }, 'GET /api/data-sources/b/foods': page([milk]) })
  const { wrapper } = await mountDialog()
  expect(select(wrapper).props('modelValue')).toBe('b')
  expect(rows()).toEqual(['TEST Milk | TEST Dairy'])
  wrapper.unmount()
})

test.each([null, 'gone'])('opens with the first source when %j is remembered', async (remembered) => {
  server({ ...base, 'GET /api/preferences': { body: preferences({ last_data_source: remembered }) }, [foodsPath]: page([oats]) })
  const { wrapper } = await mountDialog()
  expect(select(wrapper).props('modelValue')).toBe('a')
  wrapper.unmount()
})

test('changing the source saves it once and clears the results', async () => {
  const calls = server({ ...base, [foodsPath]: page([oats]), 'GET /api/data-sources/b/foods': page([]) })
  const { wrapper } = await mountDialog()
  expect(rows()).toHaveLength(1)
  select(wrapper).vm.$emit('update:modelValue', 'b')
  await flushPromises()
  expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ last_data_source: 'b' }])
  expect(rows()).toEqual([])
  expect(text()).toContain('No foods match.')
  wrapper.unmount()
})

test('a failing save of the source changes nothing visible', async () => {
  server({ ...base, 'PUT /api/preferences': 500, [foodsPath]: page([oats]), 'GET /api/data-sources/b/foods': page([milk]) })
  const { wrapper } = await mountDialog()
  select(wrapper).vm.$emit('update:modelValue', 'b')
  await flushPromises()
  expect(select(wrapper).props('modelValue')).toBe('b')
  expect(rows()).toEqual(['TEST Milk | TEST Dairy'])
  wrapper.unmount()
})

test('the first foods list on open with their groups, before anything is typed', async () => {
  const calls = server({ ...base, [foodsPath]: page([oats, milk]) })
  const { wrapper } = await mountDialog()
  expect(rows()).toEqual(['TEST Oats | TEST Grains, TEST Other', 'TEST Milk | TEST Dairy'])
  expect(calls.find((c) => c.path.endsWith('/foods'))!.query.toString()).toBe('search=&offset=0')
  wrapper.unmount()
})

test('typing sends one search after the pause, from the first page', async () => {
  const calls = server({ ...base, [foodsPath]: (call) => page(call.query.get('search') === 'oat' ? [oats] : [oats, milk]) })
  const { wrapper } = await mountDialog()
  const before = calls.filter((c) => c.path.endsWith('/foods')).length
  await type('o')
  await type('oa')
  await type('oat')
  expect(calls.filter((c) => c.path.endsWith('/foods'))).toHaveLength(before)
  await wait(400)
  const searches = calls.filter((c) => c.path.endsWith('/foods')).slice(before)
  expect(searches.map((c) => c.query.toString())).toEqual(['search=oat&offset=0'])
  expect(rows()).toEqual(['TEST Oats | TEST Grains, TEST Other'])
  wrapper.unmount()
})

test('a late reply to an older search never replaces a newer one', async () => {
  let release: (reply: Reply) => void = () => {}
  const slow = new Promise<Reply>((resolve) => (release = resolve))
  server({
    ...base,
    [foodsPath]: (call) => {
      const search = call.query.get('search')
      if (search === 'a') return slow
      return page(search === 'b' ? [milk] : [oats])
    },
  })
  const { wrapper } = await mountDialog()
  await type('a')
  await wait(400)
  await type('b')
  await wait(400)
  expect(rows()).toEqual(['TEST Milk | TEST Dairy'])
  release(page([oats]))
  await flushPromises()
  expect(rows()).toEqual(['TEST Milk | TEST Dairy'])
  wrapper.unmount()
})

test('Show more appends the next 20 and goes when all are shown', async () => {
  const twenty = Array.from({ length: 20 }, (_, i) => foodSummary({ id: 100 + i, name: `Food ${i}` }))
  const calls = server({
    ...base,
    [foodsPath]: (call) => (call.query.get('offset') === '20' ? { body: { foods: [milk], total: 21, offset: 20, limit: 20 } } : { body: { foods: twenty, total: 21, offset: 0, limit: 20 } }),
  })
  const { wrapper } = await mountDialog()
  expect(rows()).toHaveLength(20)
  await click('Show more')
  expect(calls.at(-1)!.query.toString()).toBe('search=&offset=20')
  expect(rows()).toHaveLength(21)
  expect(rows().at(-1)).toContain('TEST Milk')
  expect(text()).not.toContain('Show more')
  wrapper.unmount()
})

test('with no match the list says so', async () => {
  server({ ...base, [foodsPath]: page([]) })
  const { wrapper } = await mountDialog()
  expect(text()).toContain('No foods match.')
  wrapper.unmount()
})

const preview = foodPreview({
  id: 1,
  values: [{ attribute_id: 1, attribute_name: 'Energy', attribute_unit: 'kcal', column_name: 'TEST Energy', value: '389' }],
  groups: [{ tag_id: 5, name: 'TEST Grains' }, { tag_id: 6, name: 'TEST Other' }],
})

async function previewed(extra = {}) {
  const calls = server({ ...base, [foodsPath]: page([oats]), [oatsPath]: { body: preview }, ...extra })
  const mounted = await mountDialog()
  await chooseOats()
  return { ...mounted, calls }
}

test('choosing a food shows the ingredient to be made', async () => {
  const { wrapper } = await previewed()
  expect(nameInput().value).toBe('TEST Oats')
  expect(text()).toContain('Measured in g, values per 100 g')
  expect(text()).toContain('Energy 389 kcal')
  expect(text()).not.toContain('Not copied')
  expect(text()).not.toContain('You already have')
  const tags = [...document.querySelectorAll('.q-dialog .tag-choice')]
  expect(tags.map((t) => [t.textContent?.trim(), t.getAttribute('aria-pressed')])).toEqual([['checkTEST Grains', 'true'], ['checkTEST Other', 'true']])
  wrapper.unmount()
})

test('a tag toggles off and on', async () => {
  const { wrapper } = await previewed()
  const grains = document.querySelector<HTMLElement>('.q-dialog .tag-choice')!
  grains.click()
  await flushPromises()
  expect(document.querySelector('.q-dialog .tag-choice')!.getAttribute('aria-pressed')).toBe('false')
  document.querySelector<HTMLElement>('.q-dialog .tag-choice')!.click()
  await flushPromises()
  expect(document.querySelector('.q-dialog .tag-choice')!.getAttribute('aria-pressed')).toBe('true')
  wrapper.unmount()
})

test('what was not copied and an earlier ingredient from the food are shown', async () => {
  const { wrapper } = await previewed({
    [oatsPath]: { body: { ...preview, skipped: ['Iron', 'Zinc'], existing: [{ id: 3, name: 'Havregryn' }, { id: 4, name: 'Oats too' }] } },
  })
  expect(text()).toContain('Not copied: Iron, Zinc')
  expect(text()).toContain('You already have an ingredient from this food: Havregryn, Oats too')
  wrapper.unmount()
})

test('a food with no mapped values says so and can still be added', async () => {
  const { wrapper, calls } = await previewed({
    [oatsPath]: { body: { ...preview, values: [] } },
    'POST /api/ingredients/from-source': { status: 201, body: ingredient({ id: 9, name: 'TEST Oats' }) },
  })
  expect(text()).toContain('No columns are mapped for this source yet. Map them on the data source page.')
  await click('Add')
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  wrapper.unmount()
})

test('Add posts the food, the edited name and the tags left on, then opens the ingredient', async () => {
  const { wrapper, router, calls } = await previewed({
    'POST /api/ingredients/from-source': { status: 201, body: ingredient({ id: 9, name: 'Source oats' }) },
  })
  const name = nameInput()
  name.value = 'Source oats'
  name.dispatchEvent(new Event('input'))
  document.querySelectorAll<HTMLElement>('.q-dialog .tag-choice')[1]!.click()
  await flushPromises()
  await click('Add')
  expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([{ food_id: 1, name: 'Source oats', tag_ids: [5] }])
  expect(router.currentRoute.value.path).toBe('/ingredients/9')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  wrapper.unmount()
})

test('a second click while adding sends nothing more', async () => {
  let release: (reply: Reply) => void = () => {}
  const slow = new Promise<Reply>((resolve) => (release = resolve))
  const { wrapper, calls } = await previewed({ 'POST /api/ingredients/from-source': () => slow })
  button('Add').click()
  await flushPromises()
  button('Add').click()
  await flushPromises()
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  release({ status: 201, body: ingredient({ id: 9, name: 'X' }) })
  await flushPromises()
  wrapper.unmount()
})

test('a name in use shows under Name and the dialog stays', async () => {
  const { wrapper } = await previewed({
    'POST /api/ingredients/from-source': { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] } },
  })
  await click('Add')
  expect(text()).toContain('An ingredient with this name already exists.')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  wrapper.unmount()
})

test('a withdrawn food is refused with its text and the preview is loaded again', async () => {
  let withdrawn = false
  const { wrapper, calls } = await previewed({
    [oatsPath]: () => ({ body: { ...preview, withdrawn } }),
    'POST /api/ingredients/from-source': () => {
      withdrawn = true
      return { status: 422, body: { detail: [{ loc: ['body', 'food_id'], type: 'withdrawn', msg: 'gone' }] } }
    },
  })
  await click('Add')
  expect(calls.filter((c) => c.path === '/api/data-sources/a/foods/1')).toHaveLength(2)
  expect(text()).toContain('This food is no longer in the source.')
  expect(document.querySelector<HTMLButtonElement>('.q-dialog button[type="submit"]')!.disabled).toBe(true)
  wrapper.unmount()
})

test('any other failure of Add shows the save failure', async () => {
  const { wrapper } = await previewed({ 'POST /api/ingredients/from-source': 500 })
  await click('Add')
  expect(document.querySelector('.q-dialog [role="alert"]')!.textContent).toContain('Could not save. Try again.')
  wrapper.unmount()
})

test('an empty name asks for one and sends nothing', async () => {
  const { wrapper, calls } = await previewed()
  const name = nameInput()
  name.value = '  '
  name.dispatchEvent(new Event('input'))
  await flushPromises()
  await click('Add')
  expect(text()).toContain('Enter a name.')
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  wrapper.unmount()
})

test('Back to results returns to the list with the search kept', async () => {
  const { wrapper } = await previewed()
  await click('Back to results')
  expect(rows()).toHaveLength(1)
  expect(document.querySelector<HTMLInputElement>('.q-dialog input[aria-label="Search foods"]')).not.toBeNull()
  wrapper.unmount()
})

test('Back to results keeps what was typed in the search', async () => {
  server({ ...base, [foodsPath]: page([oats]), [oatsPath]: { body: preview } })
  const { wrapper } = await mountDialog()
  await type('oat')
  await wait(400)
  await chooseOats()
  await click('Back to results')
  expect(searchInput().value).toBe('oat')
  wrapper.unmount()
})

test('a failing search shows its message and Try again repeats it', async () => {
  let answer: Reply = 500
  server({ ...base, [foodsPath]: () => (answer === 500 ? 500 : page([oats])) })
  const { wrapper } = await mountDialog()
  expect(text()).toContain('Could not load the foods.')
  answer = { body: {} }
  await click('Try again')
  expect(rows()).toHaveLength(1)
  expect(text()).not.toContain('Could not load the foods.')
  wrapper.unmount()
})

test('a failing preview shows its message and Try again repeats it', async () => {
  let answer: Reply = 500
  server({ ...base, [foodsPath]: page([oats]), [oatsPath]: () => (answer === 500 ? 500 : { body: preview }) })
  const { wrapper } = await mountDialog()
  await chooseOats()
  expect(text()).toContain('Could not load the food.')
  answer = { body: {} }
  await click('Try again')
  expect(nameInput().value).toBe('TEST Oats')
  wrapper.unmount()
})

test('with no data sources it says so', async () => {
  server({ ...base, 'GET /api/data-sources': { body: [] } })
  const { wrapper } = await mountDialog()
  expect(text()).toContain('No data sources loaded.')
  expect(searchInput()).toBeNull()
  wrapper.unmount()
})

test('unmounting with a timer and a reply pending does nothing', async () => {
  let release: (reply: Reply) => void = () => {}
  const slow = new Promise<Reply>((resolve) => (release = resolve))
  const calls = server({ ...base, [foodsPath]: (call) => (call.query.get('search') === 'x' ? slow : page([oats])) })
  const { wrapper } = await mountDialog()
  await type('x')
  await wait(400) // the search is sent and waits for its reply
  await type('xy') // and another one is waiting for its pause
  const sent = calls.length
  wrapper.unmount()
  release(page([milk]))
  await wait(400)
  expect(calls).toHaveLength(sent)
})

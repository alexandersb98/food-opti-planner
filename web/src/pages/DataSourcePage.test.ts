import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { resetUnits } from '../units'
import { attribute, dataSource, sourceColumn } from '../test-data'
import { fakeServer, field, mountApp, settleMenu, texts, unitRoutes, type FakeServer } from '../test-app'

afterEach(() => {
  resetUnits()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

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
  fakeServer({
    'GET /api/session': 204,
    'GET /api/data-sources/testsource': { body: source },
    'GET /api/attributes': { body: attributes },
    ...unitRoutes(),
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
  expect(texts(wrapper, '.column-name')).toEqual(['TEST Energy', 'TEST Protein', 'TEST Vitamin D', 'TEST Alcohol'])
  expect(texts(wrapper, '.column-row .q-item__label--caption')).toEqual(['kcal', 'g', 'µg', 'No longer in the source'])
  const rows = wrapper.findAll('.column-row')
  expect(rows.map((row) => row.classes('text-grey-6'))).toEqual([false, false, false, true])
  wrapper.unmount()
})

test('the search narrows the columns by name, ignoring case, and keeps their order', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Search columns').setValue('T')
  expect(wrapper.findAll('.column-row')).toHaveLength(4)
  await field(wrapper, 'Search columns').setValue('PRO')
  expect(texts(wrapper, '.column-name')).toEqual(['TEST Protein'])
  await field(wrapper, 'Search columns').setValue('vit')
  expect(texts(wrapper, '.column-name')).toEqual(['TEST Vitamin D'])
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

// --- the Attribute drop-down of each column -----------------------------------

type Pending = { resolve: (reply: { body: unknown }) => void }

/** The drop-down of the nth shown column. */
function select(wrapper: Wrapper, row: number) {
  return wrapper.findAll('.column-row')[row]!.get('.q-select')
}

/** Open the nth row's drop-down and answer its entries as shown: "label" or
 * "label" with a caption run on.| caption". */
async function openList(wrapper: Wrapper, row: number): Promise<string[]> {
  await select(wrapper, row).get('.q-field__control').trigger('click')
  await settleMenu()
  return menuItems().map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '')
}

function menuItems() {
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)
  return [...(menu?.querySelectorAll<HTMLElement>('.q-item') ?? [])]
}

async function choose(label: string) {
  const item = menuItems().find((entry) => entry.textContent?.trim().startsWith(label))
  expect(item, `entry ${label}`).toBeDefined()
  item!.click()
  await flushPromises()
}

const shownValue = (wrapper: Wrapper, row: number) => select(wrapper, row).get('.q-field__native').text()

test('a g column lists the attributes that convert with g, in order, between Not mapped and Create', async () => {
  const { wrapper } = await mountPage()
  const list = await openList(wrapper, 1)
  expect(list).toEqual(['Not mapped', 'Protein', 'Fat', 'Iron', 'Create attribute…'])
  wrapper.unmount()
})

test('a kcal column lists energy attributes only, a µg column the mass ones', async () => {
  const { wrapper } = await mountPage()
  expect(await openList(wrapper, 0)).toEqual(['Not mapped', 'Energy', 'Create attribute…'])
  document.body.click()
  expect(await openList(wrapper, 2)).toEqual([
    'Not mapped', 'Proteintaken by TEST Protein', 'Fat', 'Iron', 'Create attribute…',
  ])
  wrapper.unmount()
})

test('a column with no unit lists no attribute', async () => {
  const { wrapper } = await mountPage()
  expect(await openList(wrapper, 3)).toEqual(['Not mapped', 'Create attribute…'])
  wrapper.unmount()
})

test('an attribute another column feeds is disabled and names that column', async () => {
  const { wrapper } = await mountPage()
  await openList(wrapper, 2)
  const protein = menuItems().find((item) => item.textContent?.includes('Protein'))!
  expect(protein.getAttribute('aria-disabled')).toBe('true')
  expect(protein.textContent).toContain('taken by TEST Protein')
  wrapper.unmount()
})

test('the mapped attribute is shown by name, an unmapped column says Not mapped', async () => {
  const { wrapper } = await mountPage()
  expect([0, 1, 2, 3].map((row) => shownValue(wrapper, row))).toEqual(['Not mapped', 'Protein', 'Not mapped', 'Not mapped'])
  wrapper.unmount()
})

test('choosing an attribute saves at once, once, and the row shows it', async () => {
  const puts: unknown[] = []
  const { wrapper } = await mountPage({
    'PUT /api/data-sources/testsource/columns/2': (body) => {
      puts.push(body)
      return { body: { ...columns[1], attribute_id: (body as { attribute_id: number }).attribute_id } }
    },
  })
  await openList(wrapper, 1)
  await choose('Fat')
  expect(puts).toEqual([{ attribute_id: 2 }])
  expect(shownValue(wrapper, 1)).toBe('Fat')
  wrapper.unmount()
})

test('Not mapped sends null', async () => {
  const puts: unknown[] = []
  const { wrapper } = await mountPage({
    'PUT /api/data-sources/testsource/columns/2': (body) => {
      puts.push(body)
      return { body: { ...columns[1], attribute_id: null } }
    },
  })
  await openList(wrapper, 1)
  await choose('Not mapped')
  expect(puts).toEqual([{ attribute_id: null }])
  expect(shownValue(wrapper, 1)).toBe('Not mapped')
  wrapper.unmount()
})

test('the drop-down is disabled while the request runs', async () => {
  let answer: Pending['resolve'] = () => undefined
  const { wrapper } = await mountPage({
    'PUT /api/data-sources/testsource/columns/2': () => new Promise((resolve) => (answer = resolve)),
  })
  await openList(wrapper, 1)
  await choose('Fat')
  expect(select(wrapper, 1).classes()).toContain('q-field--disabled')
  expect(select(wrapper, 0).classes()).not.toContain('q-field--disabled')
  answer({ body: { ...columns[1], attribute_id: 2 } })
  await flushPromises()
  expect(select(wrapper, 1).classes()).not.toContain('q-field--disabled')
  wrapper.unmount()
})

test('a failed save says so and the drop-down keeps the stored value', async () => {
  const { wrapper } = await mountPage({ 'PUT /api/data-sources/testsource/columns/2': 500 })
  await openList(wrapper, 1)
  await choose('Fat')
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save the mapping.')
  expect(shownValue(wrapper, 1)).toBe('Protein')
  wrapper.unmount()
})

test('attribute_taken shows who has it and reloads the source', async () => {
  const stale = { ...columns[2]!, attribute_id: null }
  let reads = 0
  const { wrapper } = await mountPage({
    'GET /api/data-sources/testsource': () => {
      reads += 1
      // The reload shows that TEST Energy took Fat meanwhile.
      return { body: reads === 1 ? source : { ...source, columns: [{ ...columns[0]!, attribute_id: 2 }, columns[1]!, stale, columns[3]!] } }
    },
    'PUT /api/data-sources/testsource/columns/3': {
      status: 422,
      body: { detail: [{ loc: ['body', 'attribute_id'], type: 'attribute_taken', msg: 'Fat is already mapped from TEST Energy.' }] },
    },
  })
  await openList(wrapper, 2)
  await choose('Fat')
  expect(reads).toBe(2)
  expect(wrapper.get('[role="alert"]').text()).toBe('Fat is already mapped from TEST Energy.')
  expect(shownValue(wrapper, 0)).toBe('Fat')
  wrapper.unmount()
})

test('unit_mismatch shows its own text and reloads the source', async () => {
  let reads = 0
  const { wrapper } = await mountPage({
    'GET /api/data-sources/testsource': () => {
      reads += 1
      return { body: source }
    },
    'PUT /api/data-sources/testsource/columns/2': {
      status: 422,
      body: { detail: [{ loc: ['body', 'attribute_id'], type: 'unit_mismatch', msg: 'no' }] },
    },
  })
  await openList(wrapper, 1)
  await choose('Fat')
  expect(reads).toBe(2)
  expect(wrapper.get('[role="alert"]').text()).toBe("TEST Protein and Fat don't convert.")
  wrapper.unmount()
})

test('a withdrawn column keeps an enabled drop-down', async () => {
  const { wrapper } = await mountPage()
  expect(select(wrapper, 3).classes()).not.toContain('q-field--disabled')
  wrapper.unmount()
})

test('the search narrows the rows without disturbing the drop-downs', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Search columns').setValue('PRO')
  expect(texts(wrapper, '.column-name')).toEqual(['TEST Protein'])
  expect(shownValue(wrapper, 0)).toBe('Protein')
  await field(wrapper, 'Search columns').setValue('')
  expect([0, 1, 2, 3].map((row) => shownValue(wrapper, row))).toEqual(['Not mapped', 'Protein', 'Not mapped', 'Not mapped'])
  wrapper.unmount()
})

test('failing attributes make the page show the load message', async () => {
  const { wrapper } = await mountPage({ 'GET /api/attributes': 500 })
  expect(wrapper.text()).toContain('Could not load the data source.')
  expect(wrapper.find('.column-row').exists()).toBe(false)
  wrapper.unmount()
})

// --- Create attribute ----------------------------------------------------------

function dialogInput(label: string) {
  return document.querySelector<HTMLInputElement>(`.new-attribute-dialog input[aria-label="${label}"]`)!
}

async function typeInto(label: string, value: string) {
  const element = dialogInput(label)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function pressInDialog(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.new-attribute-dialog button')].find(
    (b) => b.textContent?.trim() === label,
  )!
  found.click()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
}

const newAttribute = attribute({ id: 9, name: 'Carbs', unit: 'g', decimals: 3 })

test('Create attribute makes the attribute, maps the column to it and lists it for the others', async () => {
  const calls: string[] = []
  const puts: unknown[] = []
  const { wrapper } = await mountPage({
    'POST /api/attributes': () => {
      calls.push('POST')
      return { status: 201, body: newAttribute }
    },
    'PUT /api/data-sources/testsource/columns/2': (body) => {
      calls.push('PUT')
      puts.push(body)
      return { body: { ...columns[1], attribute_id: 9 } }
    },
  })
  await openList(wrapper, 1)
  await choose('Create attribute')
  expect(dialogInput('Name').value).toBe('')
  expect(dialogInput('Unit').value).toBe('g')
  await typeInto('Name', 'Carbs')
  await pressInDialog('Add')

  expect(calls).toEqual(['POST', 'PUT'])
  expect(puts).toEqual([{ attribute_id: 9 }])
  expect(shownValue(wrapper, 1)).toBe('Carbs')
  expect(await openList(wrapper, 2)).toContain('Carbstaken by TEST Protein')
  wrapper.unmount()
})

test('cancelling Create attribute changes nothing and sends nothing', async () => {
  const { wrapper } = await mountPage()
  await openList(wrapper, 1)
  await choose('Create attribute')
  await pressInDialog('Cancel')
  expect(shownValue(wrapper, 1)).toBe('Protein')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})

test('a mapping that fails after the attribute was created says so and lists the attribute', async () => {
  const { wrapper } = await mountPage({
    'POST /api/attributes': { status: 201, body: newAttribute },
    'PUT /api/data-sources/testsource/columns/2': 500,
  })
  await openList(wrapper, 1)
  await choose('Create attribute')
  await typeInto('Name', 'Carbs')
  await pressInDialog('Add')
  expect(wrapper.get('[role="alert"]').text()).toBe('The attribute was created but could not be mapped.')
  expect(shownValue(wrapper, 1)).toBe('Protein')
  expect(await openList(wrapper, 1)).toContain('Carbs')
  wrapper.unmount()
})

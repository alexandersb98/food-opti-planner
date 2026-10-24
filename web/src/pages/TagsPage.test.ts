import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeServer, mountApp, type FakeServer } from '../test-app'

const vegan = { id: 1, name: 'vegan', derive: 'all', ingredient_count: 9, recipe_count: 2, filter_count: 1 }
const quick = { id: 2, name: 'quick', derive: 'any', ingredient_count: 0, recipe_count: 0, filter_count: 0 }

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/tags': { body: [vegan, quick] },
    ...server,
  })
  const { wrapper } = await mountApp('/tags')
  return { wrapper, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function rows(wrapper: Wrapper) {
  return wrapper.findAll('.tag-row').map((row) => row.text())
}

function button(wrapper: Wrapper, label: string) {
  const found = wrapper.findAll('button, .q-item').find((b) => b.text() === label)
  expect(found, `button ${label}`).toBeDefined()
  return found!
}

function nameField(wrapper: Wrapper) {
  return wrapper.get<HTMLInputElement>('input[aria-label="Name"]')
}

/** The rule's radio buttons, as their label and whether they are chosen. */
function rule(wrapper: Wrapper) {
  return wrapper.findAll('[role="radio"]').map((radio) => [radio.text(), radio.attributes('aria-checked')])
}

async function chooseRule(wrapper: Wrapper, label: string) {
  await click(wrapper.findAll('[role="radio"]').find((radio) => radio.text() === label)!)
}

async function click(target: { trigger: (event: string) => Promise<void> }) {
  await target.trigger('click')
  await flushPromises()
}

test('each tag shows its rule, and tags no ingredient has are added by hand', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Tags')
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/vegan\s*When all ingredients have it/),
    expect.stringMatching(/quick\s*When any ingredient has it · added by hand/),
  ])
  expect(rows(wrapper)[0]).not.toContain('added by hand')
  wrapper.unmount()
})

test('a row opens in place with the rule, and Done saves the changes', async () => {
  let saved: unknown
  const { wrapper } = await mountPage({
    'PUT /api/tags/1': (body) => {
      saved = body
      return { body: { ...vegan, ...(body as object) } }
    },
  })
  await click(wrapper.findAll('.tag-row')[0]!.get('.q-item'))
  expect(nameField(wrapper).element.value).toBe('vegan')
  expect(wrapper.text()).toContain('A recipe gets this tag when')
  expect(rule(wrapper)).toEqual([
    ['all ingredients have it', 'true'],
    ['any ingredient has it', 'false'],
  ])

  await nameField(wrapper).setValue('plant-based')
  await chooseRule(wrapper, 'any ingredient has it')
  await click(button(wrapper, 'Done'))

  expect(saved).toEqual({ name: 'plant-based', derive: 'any' })
  expect(wrapper.find('input[aria-label="Name"]').exists()).toBe(false)
  expect(rows(wrapper)[0]).toMatch(/plant-based\s*When any ingredient has it/)
  wrapper.unmount()
})

test('Done without changes saves nothing', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.findAll('.tag-row')[1]!.get('.q-item'))
  await click(button(wrapper, 'Done'))
  expect(calls).not.toContain('PUT /api/tags/2')
  expect(wrapper.find('input[aria-label="Name"]').exists()).toBe(false)
  wrapper.unmount()
})

test('a name in use is shown on the name field, and the row stays open', async () => {
  const { wrapper } = await mountPage({
    'PUT /api/tags/2': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await click(wrapper.findAll('.tag-row')[1]!.get('.q-item'))
  await nameField(wrapper).setValue('vegan')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('A tag with this name already exists.')
  expect(nameField(wrapper).element.value).toBe('vegan')
  wrapper.unmount()
})

test('an empty name is not sent', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.findAll('.tag-row')[1]!.get('.q-item'))
  await nameField(wrapper).setValue(' ')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('Enter a name.')
  expect(calls).not.toContain('PUT /api/tags/2')
  wrapper.unmount()
})

test('opening another row saves the open one first', async () => {
  const { wrapper, calls } = await mountPage({
    'PUT /api/tags/2': (body) => ({ body: { ...quick, ...(body as object) } }),
  })
  await click(wrapper.findAll('.tag-row')[1]!.get('.q-item'))
  await chooseRule(wrapper, 'all ingredients have it')
  await click(wrapper.findAll('.tag-row')[0]!.get('.q-item'))
  expect(calls).toContain('PUT /api/tags/2')
  expect(rows(wrapper)[1]).toMatch(/quick\s*When all ingredients have it/)
  expect(nameField(wrapper).element.value).toBe('vegan')
  wrapper.unmount()
})

test('a new tag starts with "all ingredients" and is added at the end of the list', async () => {
  let created: unknown
  const { wrapper } = await mountPage({
    'POST /api/tags': (body) => {
      created = body
      return {
        status: 201,
        body: { ...(body as object), id: 3, ingredient_count: 0, recipe_count: 0, filter_count: 0 },
      }
    },
  })
  await click(button(wrapper, '+ New tag'))
  expect(nameField(wrapper).element.value).toBe('')
  expect(rule(wrapper)[0]).toEqual(['all ingredients have it', 'true'])
  await nameField(wrapper).setValue('organic')
  await click(button(wrapper, 'Done'))
  expect(created).toEqual({ name: 'organic', derive: 'all' })
  expect(rows(wrapper)).toHaveLength(3)
  expect(rows(wrapper)[2]).toMatch(/organic\s*When all ingredients have it · added by hand/)
  wrapper.unmount()
})

test('a new tag can be cancelled', async () => {
  const { wrapper, calls } = await mountPage()
  await click(button(wrapper, '+ New tag'))
  await click(button(wrapper, 'Cancel'))
  expect(rows(wrapper)).toHaveLength(2)
  expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  wrapper.unmount()
})

test('delete warns what else it removes the tag from, then deletes', async () => {
  const { wrapper, calls } = await mountPage({ 'DELETE /api/tags/1': 204 })
  await click(wrapper.findAll('.tag-row')[0]!.get('.q-item'))
  await click(button(wrapper, 'Delete'))
  const dialog = document.querySelector('.q-dialog')!
  expect(dialog.textContent).toContain('Delete vegan?')
  expect(dialog.textContent).toContain('This also removes it from 9 ingredients, 2 recipes and 1 plan filter.')
  expect(calls).not.toContain('DELETE /api/tags/1')

  const confirm = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Delete')!
  confirm.click()
  await flushPromises()
  expect(calls).toContain('DELETE /api/tags/1')
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

test('an unused tag says nothing else uses it', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.findAll('.tag-row')[1]!.get('.q-item'))
  await click(button(wrapper, 'Delete'))
  expect(document.querySelector('.q-dialog')!.textContent).toContain('Nothing else uses it.')
  wrapper.unmount()
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = { 'GET /api/session': 204, 'GET /api/tags': 500 }
  fakeServer(server)
  const { wrapper } = await mountApp('/tags')
  expect(wrapper.text()).toContain('Could not load the tags.')
  server['GET /api/tags'] = { body: [vegan] }
  await click(button(wrapper, 'Try again'))
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

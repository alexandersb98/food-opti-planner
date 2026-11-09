import { afterEach, expect, test, vi } from 'vitest'
import { button, click, dialog, fakeServer, field, mountApp, settleMenu, texts, type FakeServer } from '../test-app'
import { tag } from '../test-data'

const vegan = tag({ id: 1, name: 'vegan', ingredient_count: 9, recipe_count: 2, filter_count: 1 })
const quick = tag({ id: 2, name: 'quick', derive: 'any' })

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
  return texts(wrapper, '.tag-row')
}

function nameField(wrapper: Wrapper) {
  return field(wrapper, 'Name')
}

/** The rule's radio buttons, as their label and whether they are chosen. */
function rule(wrapper: Wrapper) {
  return wrapper.findAll('[role="radio"]').map((radio) => [radio.text(), radio.attributes('aria-checked')])
}

async function chooseRule(wrapper: Wrapper, label: string) {
  await click(wrapper.findAll('[role="radio"]').find((radio) => radio.text() === label)!)
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

  expect(saved).toEqual({ name: 'plant-based', derive: 'any', equivalent_tag_ids: [], confirm: false })
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
        body: { ...(body as object), id: 3, group: [], ingredient_count: 0, recipe_count: 0, filter_count: 0 },
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
  expect(dialog().text).toContain('Delete vegan?')
  expect(dialog().text).toContain('This also removes it from 9 ingredients, 2 recipes and 1 plan filter.')
  expect(calls).not.toContain('DELETE /api/tags/1')

  await dialog().click('Delete')
  expect(calls).toContain('DELETE /api/tags/1')
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

test('an unused tag says nothing else uses it', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.findAll('.tag-row')[1]!.get('.q-item'))
  await click(button(wrapper, 'Delete'))
  expect(dialog().text).toContain('Nothing else uses it.')
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

const dairy = tag({
  id: 3,
  name: 'TEST Dairy',
  derive: 'any',
  source: { key: 'testsource', name: 'TEST Source', colour: '#ff0000' },
})

test('a source tag shows its source and colour, not "added by hand"', async () => {
  const { wrapper } = await mountPage({ 'GET /api/tags': { body: [vegan, quick, dairy] } })
  expect(rows(wrapper)[2]).toMatch(/TEST Dairy\s*TEST Source · When any ingredient has it/)
  expect(rows(wrapper)[2]).not.toContain('added by hand')
  const dots = wrapper.findAll('.tag-row .source-dot')
  expect(dots).toHaveLength(1)
  expect(dots[0]!.attributes('style')).toContain('rgb(255, 0, 0)')
  wrapper.unmount()
})

test('an open source tag has no Name input and no Delete, and its rule can change', async () => {
  let saved: unknown
  const { wrapper } = await mountPage({
    'GET /api/tags': { body: [vegan, quick, dairy] },
    'PUT /api/tags/3': (body) => {
      saved = body
      return { body: { ...dairy, ...(body as object) } }
    },
  })
  await click(wrapper.findAll('.tag-row')[2]!.get('.q-item'))
  expect(wrapper.find('input[aria-label="Name"]').exists()).toBe(false)
  expect(wrapper.findAll('button').some((b) => b.text() === 'Delete')).toBe(false)
  expect(wrapper.text()).toContain("From TEST Source. It can't be renamed or deleted.")

  await chooseRule(wrapper, 'all ingredients have it')
  await click(button(wrapper, 'Done'))

  expect(saved).toEqual({ name: 'TEST Dairy', derive: 'all', equivalent_tag_ids: [], confirm: false })
  expect(rows(wrapper)[2]).toMatch(/TEST Dairy\s*TEST Source · When all ingredients have it/)
  wrapper.unmount()
})

test('a tag made by hand keeps its Name input and Delete next to source tags', async () => {
  const { wrapper } = await mountPage({ 'GET /api/tags': { body: [vegan, dairy] } })
  await click(wrapper.findAll('.tag-row')[0]!.get('.q-item'))
  expect(nameField(wrapper).element.value).toBe('vegan')
  expect(button(wrapper, 'Delete')).toBeDefined()
  wrapper.unmount()
})

test('the server order is kept and + New tag stays last', async () => {
  const { wrapper } = await mountPage({ 'GET /api/tags': { body: [vegan, quick, dairy] } })
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/^vegan/),
    expect.stringMatching(/^quick/),
    expect.stringMatching(/^TEST Dairy/),
  ])
  const items = wrapper.findAll('.q-list > .q-item, .q-list > div')
  expect(items.at(-1)!.text()).toBe('+ New tag')
  wrapper.unmount()
})

test('a refused save of a source tag shows "Could not save."', async () => {
  const { wrapper } = await mountPage({
    'GET /api/tags': { body: [vegan, quick, dairy] },
    'PUT /api/tags/3': {
      status: 422,
      body: { detail: [{ loc: ['body', 'name'], type: 'source_tag', msg: "A source tag can't be renamed" }] },
    },
  })
  await click(wrapper.findAll('.tag-row')[2]!.get('.q-item'))
  await chooseRule(wrapper, 'all ingredients have it')
  await click(button(wrapper, 'Done'))
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  wrapper.unmount()
})

test('a new tag is listed before the source tags, as the server lists it', async () => {
  const { wrapper } = await mountPage({
    'GET /api/tags': { body: [vegan, dairy] },
    'POST /api/tags': (body) => ({ status: 201, body: tag({ id: 9, ...(body as { name: string }) }) }),
  })
  await click(button(wrapper, '+ New tag'))
  await nameField(wrapper).setValue('organic')
  await click(button(wrapper, 'Done'))
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/^vegan/),
    expect.stringMatching(/^organic/),
    expect.stringMatching(/^TEST Dairy/),
  ])
  wrapper.unmount()
})


// Equivalent tags

const fish = tag({ id: 10, name: 'Fish', derive: 'any', group: [10, 11] })
const seafood = tag({ id: 11, name: 'Seafood', derive: 'any', group: [10, 11] })
const fisk = tag({ id: 12, name: 'Fisk och skaldjur', derive: 'any', group: [] })
const meat = tag({ id: 13, name: 'Meat', derive: 'any', group: [13, 14] })
const beef = tag({ id: 14, name: 'Beef', derive: 'any', group: [13, 14] })

async function mountGroups(server: FakeServer = {}) {
  return mountPage({ 'GET /api/tags': { body: [fish, seafood, fisk, meat, beef] }, ...server })
}

async function openRow(wrapper: Wrapper, index: number) {
  await click(wrapper.findAll('.tag-row')[index]!.get('.q-item'))
}

function chips(wrapper: Wrapper) {
  return texts(wrapper, '.equivalent-chip .q-chip__content')
}

/** The picker's choices, as their text. */
async function pickerChoices(wrapper: Wrapper) {
  const input = field(wrapper, 'Add equivalent tag')
  if (input.attributes('aria-expanded') !== 'true') {
    await input.element.closest('.q-field__control')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  await settleMenu()
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)
  return [...(menu?.querySelectorAll<HTMLElement>('.q-item') ?? [])].map((row) => row.textContent?.trim() ?? '')
}

async function pick(wrapper: Wrapper, name: string) {
  await pickerChoices(wrapper)
  const row = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')].find((r) => r.textContent?.includes(name))
  expect(row, `choice ${name}`).toBeDefined()
  row!.click()
  await settleMenu()
}

/** A PUT of tag `id` that answers 409 with `questions` unless `confirm` is
 * sent, recording the bodies. */
function questioning(id: number, questions: unknown[], bodies: unknown[]): FakeServer {
  const saved = { ...fish, id, group: [id, 12] }
  return {
    [`PUT /api/tags/${id}`]: (body) => {
      bodies.push(body)
      return (body as { confirm: boolean }).confirm
        ? { body: saved }
        : { status: 409, body: { questions } }
    },
  }
}

test('the open form lists the other members as chips, or None', async () => {
  const { wrapper } = await mountGroups()
  await openRow(wrapper, 0)
  expect(chips(wrapper)).toEqual(['Seafood'])
  expect(wrapper.text()).toContain('Equivalent tags')
  expect(wrapper.text()).toContain('Filtering on one of them includes recipes whose ingredients have any of them.')
  await openRow(wrapper, 2)
  expect(chips(wrapper)).toEqual([])
  expect(wrapper.text()).toContain('None')
  wrapper.unmount()
})

test('a new tag has no equivalent tags section', async () => {
  const { wrapper } = await mountGroups()
  await click(button(wrapper, '+ New tag'))
  expect(wrapper.text()).not.toContain('Equivalent tags')
  wrapper.unmount()
})

test('the picker lists tags that are not chips yet, and says where one is equivalent already', async () => {
  const { wrapper } = await mountGroups()
  await openRow(wrapper, 0)
  expect(await pickerChoices(wrapper)).toEqual([
    'Fisk och skaldjur',
    expect.stringMatching(/^Meat\s*now equivalent to Beef$/),
    expect.stringMatching(/^Beef\s*now equivalent to Meat$/),
  ])
  wrapper.unmount()
})

test('picking a tag adds a chip, removing it takes it away, and Done sends the ids', async () => {
  const bodies: unknown[] = []
  const { wrapper } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      return { body: { ...fish, group: [10, 11, 12] } }
    },
  })
  await openRow(wrapper, 0)
  await pick(wrapper, 'Fisk och skaldjur')
  expect(chips(wrapper)).toEqual(['Seafood', 'Fisk och skaldjur'])
  expect(await pickerChoices(wrapper)).not.toContain('Fisk och skaldjur')
  await wrapper.findAll('.equivalent-chip')[0]!.get('.q-chip__icon--remove').trigger('click')
  expect(chips(wrapper)).toEqual(['Fisk och skaldjur'])
  await click(button(wrapper, 'Done'))
  expect(bodies).toEqual([{ name: 'Fish', derive: 'any', equivalent_tag_ids: [12], confirm: false }])
  wrapper.unmount()
})

test('closing a tag with an unchanged group sends nothing', async () => {
  const { wrapper, calls } = await mountGroups()
  await openRow(wrapper, 0)
  await click(button(wrapper, 'Done'))
  expect(calls.filter((call) => call.startsWith('PUT'))).toEqual([])
  expect(chips(wrapper)).toEqual([])
  wrapper.unmount()
})

test('a question to move a tag: Move sends the same body with confirm', async () => {
  const bodies: unknown[] = []
  const move = { type: 'move_tag', tag_id: 13, from_tag_ids: [14] }
  const { wrapper } = await mountGroups(questioning(10, [move], bodies))
  await openRow(wrapper, 0)
  await pick(wrapper, 'Meat')
  await click(button(wrapper, 'Done'))
  expect(dialog().text).toContain('Meat is equivalent to Beef. Move Meat here?')
  await dialog().click('Move')
  expect(bodies).toEqual([
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 13], confirm: false },
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 13], confirm: true },
  ])
  expect(wrapper.find('.equivalent-chip').exists()).toBe(false)
  wrapper.unmount()
})

test("a question to move a tag: Don't move saves without that chip and without confirm", async () => {
  const bodies: unknown[] = []
  const move = { type: 'move_tag', tag_id: 13, from_tag_ids: [14] }
  const { wrapper } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      const ids = (body as { equivalent_tag_ids: number[] }).equivalent_tag_ids
      return ids.includes(13) ? { status: 409, body: { questions: [move] } } : { body: fish }
    },
  })
  await openRow(wrapper, 0)
  await pick(wrapper, 'Meat')
  await pick(wrapper, 'Fisk')
  await click(button(wrapper, 'Done'))
  await dialog().click("Don't move")
  expect(bodies).toEqual([
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 13, 12], confirm: false },
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 12], confirm: false },
  ])
  wrapper.unmount()
})

const switchFisk = { type: 'switch_rule', tag_id: 12, tag_rule: 'any', group_rule: 'all' }

test('a question to switch the rule: Switch confirms', async () => {
  const bodies: unknown[] = []
  const { wrapper } = await mountGroups(questioning(10, [switchFisk], bodies))
  await openRow(wrapper, 0)
  await pick(wrapper, 'Fisk')
  await click(button(wrapper, 'Done'))
  expect(dialog().text).toContain(
    'Fisk och skaldjur gets a recipe tag when any ingredient has it; the group uses all. Switch Fisk och skaldjur to all?',
  )
  await dialog().click('Switch')
  expect((bodies[1] as { confirm: boolean }).confirm).toBe(true)
  wrapper.unmount()
})

test("a question to switch the rule: Don't add drops the chip", async () => {
  const bodies: unknown[] = []
  const { wrapper } = await mountGroups(questioning(10, [switchFisk], bodies))
  await openRow(wrapper, 0)
  await pick(wrapper, 'Fisk')
  await click(button(wrapper, 'Done'))
  await dialog().click("Don't add")
  expect(bodies.map((body) => (body as { equivalent_tag_ids: number[] }).equivalent_tag_ids)).toEqual([[11, 12]])
  expect(wrapper.find('.equivalent-chip').exists()).toBe(false)
  wrapper.unmount()
})

test('a question to change the rule: Cancel restores the rule and saves the rest', async () => {
  const change = { type: 'change_rule', tag_ids: [10, 11], rule: 'all' }
  const bodies: unknown[] = []
  const { wrapper } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      return (body as { derive: string }).derive === 'all' ? { status: 409, body: { questions: [change] } } : { body: fish }
    },
  })
  await openRow(wrapper, 0)
  await chooseRule(wrapper, 'all ingredients have it')
  await wrapper.findAll('.equivalent-chip')[0]!.get('.q-chip__icon--remove').trigger('click')
  await click(button(wrapper, 'Done'))
  expect(dialog().text).toContain('This changes the rule of all 2 tags in the group: Fish, Seafood.')
  await dialog().click('Cancel')
  expect(bodies).toEqual([
    { name: 'Fish', derive: 'all', equivalent_tag_ids: [], confirm: false },
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [], confirm: false },
  ])
  wrapper.unmount()
})

test('two questions in one 409 are asked in turn and answered with one confirm', async () => {
  const bodies: unknown[] = []
  const questions = [
    { type: 'move_tag', tag_id: 13, from_tag_ids: [14] },
    { type: 'switch_rule', tag_id: 13, tag_rule: 'any', group_rule: 'all' },
  ]
  const { wrapper } = await mountGroups(questioning(10, questions, bodies))
  await openRow(wrapper, 0)
  await pick(wrapper, 'Meat')
  await click(button(wrapper, 'Done'))
  await dialog().click('Move')
  expect(bodies).toHaveLength(1)
  expect(dialog().text).toContain('Switch Meat to all?')
  await dialog().click('Switch')
  expect(bodies).toHaveLength(2)
  expect((bodies[1] as { confirm: boolean }).confirm).toBe(true)
  wrapper.unmount()
})

test('a save in a group reads the list again', async () => {
  const { wrapper, calls } = await mountGroups({
    'PUT /api/tags/10': { body: { ...fish, group: [10, 11, 12] } },
  })
  await openRow(wrapper, 0)
  await pick(wrapper, 'Fisk')
  await click(button(wrapper, 'Done'))
  expect(calls.filter((call) => call === 'GET /api/tags')).toHaveLength(2)
  wrapper.unmount()
})

test('a save that touches no group does not read the list again', async () => {
  const { wrapper, calls } = await mountGroups({
    'PUT /api/tags/12': (body) => ({ body: { ...fisk, ...(body as object) } }),
  })
  await openRow(wrapper, 2)
  await nameField(wrapper).setValue('Fisk')
  await click(button(wrapper, 'Done'))
  expect(calls.filter((call) => call === 'GET /api/tags')).toHaveLength(1)
  wrapper.unmount()
})

test('a row says which tags it is equivalent to', async () => {
  const { wrapper } = await mountGroups()
  expect(rows(wrapper)[0]).toMatch(/Fish\s*When any ingredient has it · added by hand · equivalent to Seafood/)
  expect(rows(wrapper)[2]).not.toContain('equivalent to')
  wrapper.unmount()
})

test('a name in use is still shown on a tag with equivalent tags', async () => {
  const { wrapper } = await mountGroups({
    'PUT /api/tags/10': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await openRow(wrapper, 0)
  await nameField(wrapper).setValue('Meat')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('A tag with this name already exists.')
  wrapper.unmount()
})

import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { tag } from '../../../test-data'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

// Ported from the Vue TagsPage and TagGroupQuestions tests.

const vegan = tag({ id: 1, name: 'vegan', ingredient_count: 9, recipe_count: 2, filter_count: 1 })
const quick = tag({ id: 2, name: 'quick', derive: 'any' })
const dairy = tag({
  id: 3,
  name: 'TEST Dairy',
  derive: 'any',
  source: { key: 'testsource', name: 'TEST Source', colour: '#ff0000' },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/tags': { body: [vegan, quick] },
    ...server,
  })
  const app = await mountApp('/tags')
  // a lazy route: the first find waits for its module
  await screen.findByRole('button', { name: '+ New tag' }, { timeout: 5000 })
  return { ...app, calls }
}

type User = Awaited<ReturnType<typeof mountPage>>['user']

/** The list's entries, as their text. */
function rows() {
  return [...screen.getByRole('list', { name: 'Tags' }).children].map((row) => row.textContent ?? '')
}

function nameField() {
  return screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' })
}

function ruleField() {
  return screen.getByRole<HTMLSelectElement>('combobox', { name: 'A recipe gets this tag when' })
}

async function openRow(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
}

async function done(user: User) {
  await user.click(screen.getByRole('button', { name: 'Done' }))
}

/** Waits until no row is open. */
async function closed() {
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Done' })).toBeNull())
}

test('each tag shows its rule, and tags no ingredient has are added by hand', async () => {
  await mountPage()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tags')
  expect(rows()).toEqual([
    expect.stringMatching(/vegan\s*When all ingredients have it/),
    expect.stringMatching(/quick\s*When any ingredient has it · added by hand/),
  ])
  expect(rows()[0]).not.toContain('added by hand')
})

test('a row opens in place with the rule, and Done saves the changes', async () => {
  let saved: unknown
  const { user } = await mountPage({
    'PUT /api/tags/1': (body) => {
      saved = body
      return { body: { ...vegan, ...(body as object) } }
    },
  })
  await openRow(user, 'vegan')
  expect(nameField().value).toBe('vegan')
  expect(document.activeElement).toBe(nameField())
  expect(ruleField().value).toBe('all')
  expect([...ruleField().options].map((option) => option.text)).toEqual([
    'all ingredients have it',
    'any ingredient has it',
  ])

  await user.clear(nameField())
  await user.type(nameField(), 'plant-based')
  await user.selectOptions(ruleField(), 'any ingredient has it')
  await done(user)

  await closed()
  expect(saved).toEqual({ name: 'plant-based', derive: 'any', equivalent_tag_ids: [], confirm: false })
  expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
  expect(rows()[0]).toMatch(/plant-based\s*When any ingredient has it/)
  // focus goes back to the entry
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /^plant-based/ }))
})

test('Done without changes saves nothing', async () => {
  const { user, calls } = await mountPage()
  await openRow(user, 'quick')
  await done(user)
  await closed()
  expect(calls).not.toContain('PUT /api/tags/2')
})

test('a name in use is shown on the name field, and the row stays open', async () => {
  const { user } = await mountPage({
    'PUT /api/tags/2': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await openRow(user, 'quick')
  await user.clear(nameField())
  await user.type(nameField(), 'vegan')
  await done(user)
  expect((await screen.findByRole('alert')).textContent).toBe('A tag with this name already exists.')
  expect(nameField().value).toBe('vegan')
  expect(nameField().getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(nameField())
})

test('an empty name is not sent', async () => {
  const { user, calls } = await mountPage()
  await openRow(user, 'quick')
  await user.clear(nameField())
  await user.type(nameField(), ' ')
  await done(user)
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a name.')
  expect(calls).not.toContain('PUT /api/tags/2')
})

test('opening another row saves the open one first', async () => {
  const { user, calls } = await mountPage({
    'PUT /api/tags/2': (body) => ({ body: { ...quick, ...(body as object) } }),
  })
  await openRow(user, 'quick')
  await user.selectOptions(ruleField(), 'all ingredients have it')
  await openRow(user, 'vegan')
  await waitFor(() => expect(nameField().value).toBe('vegan'))
  expect(calls).toContain('PUT /api/tags/2')
  expect(rows()[1]).toMatch(/quick\s*When all ingredients have it/)
})

test('a row whose save fails stays open when another is opened', async () => {
  const { user } = await mountPage({ 'PUT /api/tags/2': 500 })
  await openRow(user, 'quick')
  await user.selectOptions(ruleField(), 'all ingredients have it')
  await openRow(user, 'vegan')
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(nameField().value).toBe('quick')
})

test('a new tag starts with "all ingredients" and is added at the end of the list', async () => {
  let created: unknown
  const { user } = await mountPage({
    'POST /api/tags': (body) => {
      created = body
      return {
        status: 201,
        body: { ...(body as object), id: 3, source: null, group: [], ingredient_count: 0, recipe_count: 0, filter_count: 0 },
      }
    },
  })
  await user.click(screen.getByRole('button', { name: '+ New tag' }))
  expect(nameField().value).toBe('')
  expect(ruleField().value).toBe('all')
  expect(screen.queryByRole('button', { name: '+ New tag' })).toBeNull()
  await user.type(nameField(), 'organic')
  await done(user)
  await closed()
  expect(created).toEqual({ name: 'organic', derive: 'all' })
  expect(rows()).toHaveLength(3)
  expect(rows()[2]).toMatch(/organic\s*When all ingredients have it · added by hand/)
})

test('a new tag can be cancelled', async () => {
  const { user, calls } = await mountPage()
  await user.click(screen.getByRole('button', { name: '+ New tag' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(rows()).toHaveLength(2)
  expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ New tag' }))
})

test('delete warns what else it removes the tag from, then deletes', async () => {
  const { user, calls } = await mountPage({ 'DELETE /api/tags/1': 204 })
  await openRow(user, 'vegan')
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  const question = screen.getByRole('alertdialog', { name: 'Delete vegan?' })
  expect(question.textContent).toContain('This also removes it from 9 ingredients, 2 recipes and 1 plan filter.')
  expect(calls).not.toContain('DELETE /api/tags/1')

  await user.click(within(question).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(rows()).toHaveLength(1))
  expect(calls).toContain('DELETE /api/tags/1')
})

test('an unused tag says nothing else uses it', async () => {
  const { user } = await mountPage()
  await openRow(user, 'quick')
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByRole('alertdialog', { name: 'Delete quick?' }).textContent).toContain('Nothing else uses it.')
})

test('a failed delete says so and keeps the tag', async () => {
  const { user } = await mountPage({ 'DELETE /api/tags/1': 500 })
  await openRow(user, 'vegan')
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Could not delete. Try again.')
  expect(rows()).toHaveLength(2)
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = { 'GET /api/session': 204, 'GET /api/tags': 500 }
  fakeServer(server)
  const { user } = await mountApp('/tags')
  expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain('Could not load the tags.')
  server['GET /api/tags'] = { body: [vegan] }
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('list', { name: 'Tags' })
  expect(rows()).toHaveLength(1)
})

test('no tags yet says so and offers a new one', async () => {
  await mountPage({ 'GET /api/tags': { body: [] } })
  expect(await screen.findByText('No tags yet.')).toBeDefined()
  expect(screen.getByRole('button', { name: '+ New tag' })).toBeDefined()
})

test('a source tag shows its source and colour, not "added by hand"', async () => {
  await mountPage({ 'GET /api/tags': { body: [vegan, quick, dairy] } })
  expect(rows()[2]).toMatch(/TEST Dairy\s*TEST Source · When any ingredient has it/)
  expect(rows()[2]).not.toContain('added by hand')
  const row = screen.getByRole('button', { name: /^TEST Dairy/ })
  expect(row.style.getPropertyValue('--tags-source')).toBe('#ff0000')
  expect(row.querySelector('.tags-swatch')).not.toBeNull()
  expect(screen.getByRole('button', { name: /^vegan/ }).querySelector('.tags-swatch')).toBeNull()
})

test('an open source tag has no Name input and no Delete, and its rule can change', async () => {
  let saved: unknown
  const { user } = await mountPage({
    'GET /api/tags': { body: [vegan, quick, dairy] },
    'PUT /api/tags/3': (body) => {
      saved = body
      return { body: { ...dairy, ...(body as object) } }
    },
  })
  await openRow(user, 'TEST Dairy')
  expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  expect(screen.getByText("From TEST Source. It can't be renamed or deleted.")).toBeDefined()
  expect(document.activeElement).toBe(ruleField())

  await user.selectOptions(ruleField(), 'all ingredients have it')
  await done(user)
  await closed()

  expect(saved).toEqual({ name: 'TEST Dairy', derive: 'all', equivalent_tag_ids: [], confirm: false })
  expect(rows()[2]).toMatch(/TEST Dairy\s*TEST Source · When all ingredients have it/)
})

test('a tag made by hand keeps its Name input and Delete next to source tags', async () => {
  const { user } = await mountPage({ 'GET /api/tags': { body: [vegan, dairy] } })
  await openRow(user, 'vegan')
  expect(nameField().value).toBe('vegan')
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
})

test('the server order is kept and + New tag comes after the list', async () => {
  await mountPage({ 'GET /api/tags': { body: [vegan, quick, dairy] } })
  expect(rows()).toEqual([
    expect.stringMatching(/^vegan/),
    expect.stringMatching(/^quick/),
    expect.stringMatching(/^TEST Dairy/),
  ])
  const list = screen.getByRole('list', { name: 'Tags' })
  const newTag = screen.getByRole('button', { name: '+ New tag' })
  expect(list.compareDocumentPosition(newTag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('a refused save of a source tag shows "Could not save."', async () => {
  const { user } = await mountPage({
    'GET /api/tags': { body: [vegan, quick, dairy] },
    'PUT /api/tags/3': {
      status: 422,
      body: { detail: [{ loc: ['body', 'name'], type: 'source_tag', msg: "A source tag can't be renamed" }] },
    },
  })
  await openRow(user, 'TEST Dairy')
  await user.selectOptions(ruleField(), 'all ingredients have it')
  await done(user)
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save. Try again.')
})

test('a new tag is listed before the source tags, as the server lists it', async () => {
  const { user } = await mountPage({
    'GET /api/tags': { body: [vegan, dairy] },
    'POST /api/tags': (body) => ({ status: 201, body: tag({ id: 9, ...(body as { name: string }) }) }),
  })
  await user.click(screen.getByRole('button', { name: '+ New tag' }))
  await user.type(nameField(), 'organic')
  await done(user)
  await closed()
  expect(rows()).toEqual([
    expect.stringMatching(/^vegan/),
    expect.stringMatching(/^organic/),
    expect.stringMatching(/^TEST Dairy/),
  ])
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

/** The open tag's equivalent tags, by their remove buttons. */
function chips() {
  return screen
    .queryAllByRole('button', { name: /^Remove / })
    .map((button) => button.getAttribute('aria-label')!.replace(/^Remove /, ''))
}

async function openPicker(user: User) {
  await user.click(screen.getByRole('button', { name: 'Add equivalent tag' }))
  return screen.getByRole('dialog', { name: 'Add equivalent tag' })
}

/** The picker's choices, as their text. */
async function pickerChoices(user: User) {
  const sheet = await openPicker(user)
  const choices = within(sheet)
    .queryAllByRole('listitem')
    .map((choice) => choice.textContent ?? '')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add equivalent tag' })).toBeNull())
  return choices
}

async function pick(user: User, name: string) {
  const sheet = await openPicker(user)
  await user.click(within(sheet).getByRole('button', { name: new RegExp(`^${name}`) }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add equivalent tag' })).toBeNull())
}

function question() {
  return screen.getByRole('alertdialog', { name: 'Equivalent tags' })
}

async function answer(user: User, label: string) {
  await user.click(within(question()).getByRole('button', { name: label }))
}

/** A PUT of tag `id` that answers 409 with `questions` unless `confirm` is
 * sent, recording the bodies. */
function questioning(id: number, questions: unknown[], bodies: unknown[]): FakeServer {
  const saved = { ...fish, id, group: [id, 12] }
  return {
    [`PUT /api/tags/${id}`]: (body) => {
      bodies.push(body)
      return (body as { confirm: boolean }).confirm ? { body: saved } : { status: 409, body: { questions } }
    },
  }
}

test('the open form lists the other members as chips, or None', async () => {
  const { user } = await mountGroups()
  await openRow(user, 'Fish')
  expect(chips()).toEqual(['Seafood'])
  const section = screen.getByRole('region', { name: 'Equivalent tags' })
  expect(section.textContent).toContain('Filtering on one of them includes recipes whose ingredients have any of them.')
  await openRow(user, 'Fisk och skaldjur')
  await waitFor(() => expect(nameField().value).toBe('Fisk och skaldjur'))
  expect(chips()).toEqual([])
  expect(screen.getByRole('region', { name: 'Equivalent tags' }).textContent).toContain('None')
})

test('a new tag has no equivalent tags section', async () => {
  const { user } = await mountGroups()
  await user.click(screen.getByRole('button', { name: '+ New tag' }))
  expect(screen.queryByRole('region', { name: 'Equivalent tags' })).toBeNull()
})

test('the picker lists tags that are not chips yet, and says where one is equivalent already', async () => {
  const { user } = await mountGroups()
  await openRow(user, 'Fish')
  expect(await pickerChoices(user)).toEqual([
    'Fisk och skaldjur',
    expect.stringMatching(/^Meat\s*now equivalent to Beef$/),
    expect.stringMatching(/^Beef\s*now equivalent to Meat$/),
  ])
})

test('the picker narrows to what is typed', async () => {
  const { user } = await mountGroups()
  await openRow(user, 'Fish')
  const sheet = await openPicker(user)
  await user.type(within(sheet).getByRole('searchbox', { name: 'Search tags' }), 'be')
  expect(within(sheet).getAllByRole('listitem').map((choice) => choice.textContent)).toEqual([
    expect.stringMatching(/^Beef/),
  ])
  await user.type(within(sheet).getByRole('searchbox', { name: 'Search tags' }), 'x')
  expect(within(sheet).getByText('No other tag matches.')).toBeDefined()
})

test('picking a tag adds a chip, removing it takes it away, and Done sends the ids', async () => {
  const bodies: unknown[] = []
  const { user } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      return { body: { ...fish, group: [10, 11, 12] } }
    },
  })
  await openRow(user, 'Fish')
  await pick(user, 'Fisk och skaldjur')
  expect(chips()).toEqual(['Seafood', 'Fisk och skaldjur'])
  expect(await pickerChoices(user)).not.toContain('Fisk och skaldjur')
  await user.click(screen.getByRole('button', { name: 'Remove Seafood' }))
  expect(chips()).toEqual(['Fisk och skaldjur'])
  await done(user)
  await closed()
  expect(bodies).toEqual([{ name: 'Fish', derive: 'any', equivalent_tag_ids: [12], confirm: false }])
})

test('closing a tag with an unchanged group sends nothing', async () => {
  const { user, calls } = await mountGroups()
  await openRow(user, 'Fish')
  await done(user)
  await closed()
  expect(calls.filter((call) => call.startsWith('PUT'))).toEqual([])
  expect(chips()).toEqual([])
})

test('a question to move a tag: Move sends the same body with confirm', async () => {
  const bodies: unknown[] = []
  const move = { type: 'move_tag', tag_id: 13, from_tag_ids: [14] }
  const { user } = await mountGroups(questioning(10, [move], bodies))
  await openRow(user, 'Fish')
  await pick(user, 'Meat')
  await done(user)
  await waitFor(() => expect(question().textContent).toContain('Meat is equivalent to Beef. Move Meat here?'))
  expect(within(question()).getByRole('button', { name: "Don't move" })).toBeDefined()
  await answer(user, 'Move')
  await closed()
  expect(bodies).toEqual([
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 13], confirm: false },
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 13], confirm: true },
  ])
  expect(chips()).toEqual([])
})

test("a question to move a tag: Don't move saves without that chip and without confirm", async () => {
  const bodies: unknown[] = []
  const move = { type: 'move_tag', tag_id: 13, from_tag_ids: [14] }
  const { user } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      const ids = (body as { equivalent_tag_ids: number[] }).equivalent_tag_ids
      return ids.includes(13) ? { status: 409, body: { questions: [move] } } : { body: fish }
    },
  })
  await openRow(user, 'Fish')
  await pick(user, 'Meat')
  await pick(user, 'Fisk')
  await done(user)
  await waitFor(() => question())
  await answer(user, "Don't move")
  await closed()
  expect(bodies).toEqual([
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 13, 12], confirm: false },
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 12], confirm: false },
  ])
})

const switchFisk = { type: 'switch_rule', tag_id: 12, tag_rule: 'any', group_rule: 'all' }

test('a question to switch the rule: Switch confirms', async () => {
  const bodies: unknown[] = []
  const { user } = await mountGroups(questioning(10, [switchFisk], bodies))
  await openRow(user, 'Fish')
  await pick(user, 'Fisk')
  await done(user)
  await waitFor(() =>
    expect(question().textContent).toContain(
      'Fisk och skaldjur gets a recipe tag when any ingredient has it; the group uses all. Switch Fisk och skaldjur to all?',
    ),
  )
  await answer(user, 'Switch')
  await closed()
  expect((bodies[1] as { confirm: boolean }).confirm).toBe(true)
})

test("a question to switch the rule: Don't add drops the chip", async () => {
  const bodies: unknown[] = []
  const { user } = await mountGroups(questioning(10, [switchFisk], bodies))
  await openRow(user, 'Fish')
  await pick(user, 'Fisk')
  await done(user)
  await waitFor(() => question())
  await answer(user, "Don't add")
  await closed()
  expect(bodies.map((body) => (body as { equivalent_tag_ids: number[] }).equivalent_tag_ids)).toEqual([[11, 12]])
  expect(chips()).toEqual([])
})

test('a question to change the rule: Cancel restores the rule and saves the rest', async () => {
  const change = { type: 'change_rule', tag_ids: [10, 11], rule: 'all' }
  const bodies: unknown[] = []
  const { user } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      return (body as { derive: string }).derive === 'all' ? { status: 409, body: { questions: [change] } } : { body: fish }
    },
  })
  await openRow(user, 'Fish')
  await user.selectOptions(ruleField(), 'all ingredients have it')
  await user.click(screen.getByRole('button', { name: 'Remove Seafood' }))
  await done(user)
  await waitFor(() =>
    expect(question().textContent).toContain('This changes the rule of all 2 tags in the group: Fish, Seafood.'),
  )
  await answer(user, 'Cancel')
  await closed()
  expect(bodies).toEqual([
    { name: 'Fish', derive: 'all', equivalent_tag_ids: [], confirm: false },
    { name: 'Fish', derive: 'any', equivalent_tag_ids: [], confirm: false },
  ])
})

test('two questions in one 409 are asked in turn and answered with one confirm', async () => {
  const bodies: unknown[] = []
  const questions = [
    { type: 'move_tag', tag_id: 13, from_tag_ids: [14] },
    { type: 'switch_rule', tag_id: 13, tag_rule: 'any', group_rule: 'all' },
  ]
  const { user } = await mountGroups(questioning(10, questions, bodies))
  await openRow(user, 'Fish')
  await pick(user, 'Meat')
  await done(user)
  await waitFor(() => expect(question().textContent).toContain('Question 1 of 2'))
  await answer(user, 'Move')
  expect(bodies).toHaveLength(1)
  expect(question().textContent).toContain('Question 2 of 2')
  expect(question().textContent).toContain('Switch Meat to all?')
  await answer(user, 'Switch')
  await closed()
  expect(bodies).toHaveLength(2)
  expect((bodies[1] as { confirm: boolean }).confirm).toBe(true)
})

test('three questions are asked in turn; a no to one keeps the others asked', async () => {
  const bodies: unknown[] = []
  const questions = [
    { type: 'move_tag', tag_id: 13, from_tag_ids: [14] },
    { type: 'switch_rule', tag_id: 12, tag_rule: 'any', group_rule: 'all' },
    { type: 'change_rule', tag_ids: [10, 11, 12, 13], rule: 'all' },
  ]
  const { user } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      return bodies.length === 1 ? { status: 409, body: { questions } } : { body: fish }
    },
  })
  await openRow(user, 'Fish')
  await user.selectOptions(ruleField(), 'all ingredients have it')
  await pick(user, 'Meat')
  await pick(user, 'Fisk')
  await done(user)
  await waitFor(() => expect(question().textContent).toContain('Move Meat here?'))
  await answer(user, 'Move')
  expect(question().textContent).toContain('Switch Fisk och skaldjur to all?')
  await answer(user, "Don't add")
  expect(question().textContent).toContain('This changes the rule of all 4 tags in the group: Fish, Seafood, Fisk och skaldjur, Meat.')
  await answer(user, 'Change')
  await closed()
  // the no drops Fisk; the yeses stay as typed, without confirm
  expect(bodies[1]).toEqual({ name: 'Fish', derive: 'all', equivalent_tag_ids: [11, 13], confirm: false })
})

test('closing the questions answers no to the rest', async () => {
  const bodies: unknown[] = []
  const move = { type: 'move_tag', tag_id: 13, from_tag_ids: [14] }
  const { user } = await mountGroups({
    'PUT /api/tags/10': (body) => {
      bodies.push(body)
      return bodies.length === 1 ? { status: 409, body: { questions: [move] } } : { body: fish }
    },
  })
  await openRow(user, 'Fish')
  await pick(user, 'Meat')
  await pick(user, 'Fisk')
  await done(user)
  await waitFor(() => question())
  await user.keyboard('{Escape}')
  await closed()
  expect(bodies[1]).toEqual({ name: 'Fish', derive: 'any', equivalent_tag_ids: [11, 12], confirm: false })
})

test('a save in a group reads the list again', async () => {
  const { user, calls } = await mountGroups({
    'PUT /api/tags/10': { body: { ...fish, group: [10, 11, 12] } },
  })
  await openRow(user, 'Fish')
  await pick(user, 'Fisk')
  await done(user)
  await waitFor(() => expect(calls.filter((call) => call === 'GET /api/tags')).toHaveLength(2))
})

test('a save that touches no group does not read the list again', async () => {
  const { user, calls } = await mountGroups({
    'PUT /api/tags/12': (body) => ({ body: { ...fisk, ...(body as object) } }),
  })
  await openRow(user, 'Fisk och skaldjur')
  await user.clear(nameField())
  await user.type(nameField(), 'Fisk')
  await done(user)
  await closed()
  expect(calls.filter((call) => call === 'GET /api/tags')).toHaveLength(1)
})

test('a row says which tags it is equivalent to', async () => {
  await mountGroups()
  expect(rows()[0]).toMatch(/Fish\s*When any ingredient has it · added by hand · equivalent to Seafood/)
  expect(rows()[2]).not.toContain('equivalent to')
})

test('a name in use is still shown on a tag with equivalent tags', async () => {
  const { user } = await mountGroups({
    'PUT /api/tags/10': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await openRow(user, 'Fish')
  await user.clear(nameField())
  await user.type(nameField(), 'Meat')
  await done(user)
  expect((await screen.findByRole('alert')).textContent).toBe('A tag with this name already exists.')
})

test('deleting a tag in a group says it leaves the group', async () => {
  const { user } = await mountGroups()
  await openRow(user, 'Fish')
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByRole('alertdialog', { name: 'Delete Fish?' }).textContent).toContain(
    'It also leaves its group of equivalent tags',
  )
})

test('deleting a tag in no group does not mention groups', async () => {
  const { user } = await mountGroups()
  await openRow(user, 'Fisk och skaldjur')
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByRole('alertdialog', { name: 'Delete Fisk och skaldjur?' }).textContent).not.toContain('group')
})

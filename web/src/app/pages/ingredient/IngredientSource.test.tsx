import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Ingredient } from '../../../api/types'
import { attribute, ingredient, ingredientSource } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The source link and the updated-values note on the ingredient page
// (stories 163, 164), ported from the Vue SourceChip and UpdatedValuesBanner
// tests and the IngredientPage source tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 })
const fat = attribute({ id: 3, name: 'Fat', unit: 'g', decimals: 1 })
const oats = ingredient({
  id: 7,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
})
const linkedOats = { ...oats, source: ingredientSource() }

const updates = [
  { attribute_id: 2, value: '16.9', new_value: '17.2' },
  { attribute_id: 3, value: null, new_value: '4' },
]
const withUpdates = { ...linkedOats, updated_values: updates }
const answeredOats = {
  ...linkedOats,
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '17.2' },
    { attribute_id: 3, value: '4' },
  ],
}

/** Opens /ingredients/7 showing `shown`, and waits for the form. */
async function open(shown: Ingredient = linkedOats, server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/counts': { body: { recipes: 1, ingredients: 1, attributes: 3, tags: 0 } },
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy, protein, fat] },
    'GET /api/tags': { body: [] },
    'GET /api/ingredients/7': { body: shown },
    'GET /api/ingredients': { body: [] },
    ...server,
  })
  const app = await mountApp('/ingredients/7')
  await screen.findByRole('textbox', { name: 'Name' }, { timeout: 3000 })
  await waitFor(() => expect(calls).toContain('GET /api/units'))
  return { ...app, calls }
}

type Page = Awaited<ReturnType<typeof open>>

function box(name: string) {
  return screen.getByRole<HTMLInputElement>(name === 'Measured in' ? 'combobox' : 'textbox', { name })
}

async function type(page: Page, name: string, text: string) {
  await page.user.clear(box(name))
  if (text) await page.user.type(box(name), text)
}

/** The source tag, found by its text. */
function sourceTag() {
  return screen.queryByText('From TEST Source: TEST Oats')
}

/** The unit groups the Measured in list offers. */
async function unitGroups(page: Page) {
  await page.user.click(box('Measured in'))
  const list = await screen.findByRole('listbox', { name: 'Measured in' })
  const groups = within(list).getAllByRole('group').length
  await page.user.keyboard('{Escape}')
  return groups
}

function banner() {
  return screen.queryByRole('status', { name: 'Updated values available' })
}

function bannerLines() {
  return within(banner()!)
    .getAllByRole('listitem')
    .map((line) => line.textContent)
}

/** The answers posted to source-values, replying `reply`. */
function answerRoute(reply: object | number) {
  const posts: unknown[] = []
  const handler = (body: unknown) => {
    posts.push(body)
    return typeof reply === 'number' ? reply : { body: reply }
  }
  return { posts, route: { 'POST /api/ingredients/7/source-values': handler } satisfies FakeServer }
}

/** The PUT bodies a save sends. */
function saveRoute() {
  const sent: unknown[] = []
  const route: FakeServer = {
    'PUT /api/ingredients/7': (body) => {
      sent.push(body)
      return { body: { ...linkedOats, ...(body as object) } }
    },
  }
  return { sent, route }
}

// The source link.

test('an ordinary ingredient shows no source and no Unlink, and offers every unit group', async () => {
  const page = await open(oats)
  expect(sourceTag()).toBeNull()
  expect(screen.queryByRole('button', { name: 'Unlink from source' })).toBeNull()
  expect(await unitGroups(page)).toBe(3)
})

test('a linked ingredient names the source and the food in the source colour, with readable text', async () => {
  await open()
  const tag = sourceTag()!
  expect(tag.style.getPropertyValue('--source')).toBe('#1976d2')
  expect(tag.style.getPropertyValue('--source-ink')).toBe('#ffffff')
  expect(screen.queryByText('No longer in the source')).toBeNull()
})

test('a light source colour gets dark text', async () => {
  await open({ ...oats, source: ingredientSource({ colour: '#ffeb3b' }) })
  expect(sourceTag()!.style.getPropertyValue('--source-ink')).toBe('#1d1d1d')
})

test('a food the source no longer has says so', async () => {
  await open({ ...oats, source: ingredientSource({ withdrawn: true }) })
  expect(screen.getByText('No longer in the source')).toBeDefined()
})

test('Unlink asks first, naming the ingredient and the source; Cancel sends nothing', async () => {
  const page = await open(linkedOats, { 'POST /api/ingredients/7/unlink': { body: { ...oats, source: null } } })
  await page.user.click(screen.getByRole('button', { name: 'Unlink from source' }))
  const question = await screen.findByRole('alertdialog', { name: 'Unlink Oats from TEST Source?' })
  expect(question.textContent).toContain('The ingredient keeps its values and tags.')
  await page.user.click(within(question).getByRole('button', { name: 'Cancel' }))
  expect(page.calls).not.toContain('POST /api/ingredients/7/unlink')
  expect(sourceTag()).not.toBeNull()
})

test('Unlink posts once, removes the source, keeps what was typed and offers every unit group again', async () => {
  const page = await open(linkedOats, { 'POST /api/ingredients/7/unlink': { body: { ...oats, source: null } } })
  expect(await unitGroups(page)).toBe(1)
  await type(page, 'Name', 'Typed before')
  await page.user.click(screen.getByRole('button', { name: 'Unlink from source' }))
  await page.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unlink' }))
  await waitFor(() => expect(sourceTag()).toBeNull())
  expect(page.calls.filter((call) => call === 'POST /api/ingredients/7/unlink')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Unlink from source' })).toBeNull()
  expect(box('Name').value).toBe('Typed before')
  expect(await unitGroups(page)).toBe(3)
})

test('a failing unlink says so and the source stays', async () => {
  const page = await open(linkedOats, { 'POST /api/ingredients/7/unlink': 500 })
  await page.user.click(screen.getByRole('button', { name: 'Unlink from source' }))
  await page.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unlink' }))
  expect((await screen.findByText('Could not unlink. Try again.')).getAttribute('role')).toBe('alert')
  expect(sourceTag()).not.toBeNull()
})

// The updated values.

test('no note on an ordinary ingredient', async () => {
  await open({ ...oats, updated_values: updates })
  expect(banner()).toBeNull()
})

test('no note on a linked ingredient without updates', async () => {
  await open()
  expect(banner()).toBeNull()
})

test('a linked ingredient with updates lists old and new per attribute', async () => {
  await open(withUpdates)
  expect(banner()!.textContent).toContain('The data source has new values for this ingredient.')
  expect(bannerLines()).toEqual(['Protein 16.9 g → 17.2 g', 'Fat none → 4 g'])
})

const unknown = { attribute_id: 9, value: '1', new_value: '2' }

test('an update for an unknown attribute is skipped', async () => {
  await open({ ...linkedOats, updated_values: [unknown, updates[0]] })
  expect(bannerLines()).toEqual(['Protein 16.9 g → 17.2 g'])
})

test('with only unknown attributes there is no note', async () => {
  await open({ ...linkedOats, updated_values: [unknown] })
  expect(banner()).toBeNull()
})

test('Accept posts once, the note goes, the fields take the new values and what was typed stays', async () => {
  const { posts, route } = answerRoute(answeredOats)
  const saving = saveRoute()
  const page = await open(withUpdates, { ...route, ...saving.route })
  await type(page, 'Name', 'Typed before')
  await page.user.click(screen.getByRole('button', { name: 'Accept' }))
  await waitFor(() => expect(banner()).toBeNull())
  expect(posts).toEqual([{ answer: 'accept' }])
  expect([box('Protein').value, box('Fat').value, box('Name').value]).toEqual(['17.2', '4', 'Typed before'])
  await page.user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saving.sent).toEqual([expect.objectContaining({ name: 'Typed before' })]))
})

test('Keep mine posts keep, the note goes, the fields stay and 0 goes where there was no value', async () => {
  const { posts, route } = answerRoute({ ...linkedOats, values: [...oats.values, { attribute_id: 3, value: '0' }] })
  const saving = saveRoute()
  const page = await open(withUpdates, { ...route, ...saving.route })
  await page.user.click(screen.getByRole('button', { name: 'Keep mine' }))
  await waitFor(() => expect(banner()).toBeNull())
  expect(posts).toEqual([{ answer: 'keep' }])
  expect([box('Protein').value, box('Fat').value]).toEqual(['16.9', '0'])
  await page.user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saving.sent).toHaveLength(1))
  const [body] = saving.sent as { values: unknown[] }[]
  expect(body.values).toContainEqual({ attribute_id: 3, value: '0' })
})

test('Keep mine does not overwrite a value typed for an attribute that had none', async () => {
  const { route } = answerRoute({ ...linkedOats, values: [...oats.values, { attribute_id: 3, value: '0' }] })
  const page = await open(withUpdates, route)
  await type(page, 'Fat', '2.5')
  await page.user.click(screen.getByRole('button', { name: 'Keep mine' }))
  await waitFor(() => expect(banner()).toBeNull())
  expect(box('Fat').value).toBe('2.5')
})

test('a failing answer says so, the note stays and the fields are unchanged', async () => {
  const { route } = answerRoute(500)
  const page = await open(withUpdates, route)
  await page.user.click(screen.getByRole('button', { name: 'Accept' }))
  expect((await screen.findByText('Could not save your answer. Try again.')).getAttribute('role')).toBe('alert')
  expect(banner()).not.toBeNull()
  expect(box('Protein').value).toBe('16.9')
})

test('the answers are disabled while one is sent, and a second click sends nothing', async () => {
  const posts: unknown[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const page = await open(withUpdates, {
    'POST /api/ingredients/7/source-values': async (body) => {
      posts.push(body)
      await gate
      return { body: answeredOats }
    },
  })
  const accept = screen.getByRole<HTMLButtonElement>('button', { name: 'Accept' })
  await page.user.click(accept)
  await waitFor(() => expect(accept.disabled).toBe(true))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Keep mine' }).disabled).toBe(true)
  await page.user.click(accept)
  release()
  await waitFor(() => expect(banner()).toBeNull())
  expect(posts).toHaveLength(1)
})

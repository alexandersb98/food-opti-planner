import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, ingredient, lines, recipe, tag } from '../../../test-data'
import { BASE_PATH } from '../../base'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The spread's edit mode (ticket 27): the parity checklist is the field,
// save, cancel, delete and new-recipe scenarios of the Vue RecipePage tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 })
const vegan = tag({ id: 1, name: 'vegan' })
const quick = tag({ id: 2, name: 'quick' })
const nuts = tag({ id: 3, name: 'contains-nuts', derive: 'any' })
const oats = ingredient({
  id: 1,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
  tag_ids: [1],
})
const milk = ingredient({ id: 2, name: 'Milk', unit: 'ml', values: [{ attribute_id: 1, value: '64' }] })
const porridge = recipe({
  id: 9,
  name: 'Porridge',
  sections: lines([1, '60'], [2, '200']),
  extra_tag_ids: [2],
  derived_tag_ids: [1],
})

const catalogue: FakeServer = {
  'GET /api/session': 204,
  'GET /api/attributes': { body: [energy, protein] },
  'GET /api/tags': { body: [vegan, quick, nuts] },
  'GET /api/ingredients': { body: [oats, milk] },
  'GET /api/recipes': { body: [] },
  ...unitRoutes(),
}

/** The spread of recipe 9, in edit mode. */
async function edit(server: FakeServer = {}) {
  const calls = fakeServer({ 'GET /api/recipes/9': { body: porridge }, ...catalogue, ...server })
  const app = await mountApp('/recipes/9')
  await app.user.click(await screen.findByRole('button', { name: 'Edit Porridge' }, { timeout: 5000 }))
  return { ...app, calls }
}

/** A request's bodies, recorded, and the reply. */
function recorder(status: number, reply: (body: object) => object) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: reply(body as object) }
  }
  return { sent, handler }
}

function box(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label, { selector: 'input, textarea' })
}

/** The error shown on the field labelled `label`, or '' if none. */
function errorOn(label: string) {
  const ids = box(label).getAttribute('aria-describedby')?.split(' ') ?? []
  const error = ids.map((id) => document.getElementById(id)).find((el) => el?.classList.contains('field-error'))
  return error?.textContent ?? ''
}

/** Replace what the field labelled `label` holds with `text`, as pasted. */
async function retype(user: Awaited<ReturnType<typeof edit>>['user'], label: string, text: string) {
  await user.clear(box(label))
  if (text) await user.paste(text)
}

function where(router: Awaited<ReturnType<typeof edit>>['router']) {
  return router.state.location.pathname.slice(BASE_PATH.length)
}

test('Edit annotates the spread: every field holds the recipe, the name has the focus and swipes are off', async () => {
  await edit({
    'GET /api/recipes/9': {
      body: { ...porridge, servings: 4, instructions: 'Soak.\n\nCook.', source_url: 'https://example.com/p', hard_max_multiplier: '5' },
    },
  })
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Editing Porridge')
  expect(document.activeElement).toBe(box('Name'))
  expect(box('Name').value).toBe('Porridge')
  expect(box('Serves').value).toBe('4')
  expect(errorOn('Serves')).toBe('')
  expect(document.getElementById(box('Serves').getAttribute('aria-describedby')!)?.textContent).toBe(
    'Amounts are for the whole recipe.',
  )
  expect([box('From').value, box('To').value]).toEqual(['0.5', '2'])
  expect(screen.getByRole('button', { name: 'Any amount' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByLabelText('In steps of')).toBeNull()
  expect(box('Instructions').value).toBe('Soak.\n\nCook.')
  expect(box('Source').value).toBe('https://example.com/p')
  // the advanced settings are open when they hold something other than the defaults
  expect(box('Never more than').value).toBe('5')
  expect(box('Never more than').closest('details')!.open).toBe(true)
  // the lines are annotated too (ticket 33's line editor)
  const ingredients = within(screen.getByRole('region', { name: 'Ingredients' }))
  expect(ingredients.getByRole<HTMLInputElement>('textbox', { name: 'Amount of Oats' }).value).toBe('60')
  expect(ingredients.getByRole<HTMLInputElement>('textbox', { name: 'Amount of Milk' }).value).toBe('200')
  expect(document.querySelector('form.spread-editor')!.hasAttribute('data-no-swipe')).toBe(true)
  // the bar says what is going on
  expect(screen.getByText('Annotating: change anything underlined')).toBeDefined()
})

test('Cancel throws the edits away and restores the spread, with no call', async () => {
  const { user, calls } = await edit()
  await retype(user, 'Name', 'Changed')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Porridge')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Porridge' }))
  await user.click(screen.getByRole('button', { name: 'Edit Porridge' }))
  expect(box('Name').value).toBe('Porridge')
  expect(calls.some((call) => call.startsWith('PUT'))).toBe(false)
})

test('Save sends the fields and leaves edit mode', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...porridge, ...body }))
  const { user } = await edit({ 'PUT /api/recipes/9': handler })
  await retype(user, 'Name', 'Milk porridge')
  await retype(user, 'Serves', '2')
  await retype(user, 'From', '1')
  await retype(user, 'To', '3')
  await user.click(screen.getByRole('button', { name: 'In steps' }))
  await retype(user, 'In steps of', '0.5')
  await retype(user, 'Never more than', '4')
  await retype(user, 'Over-size penalty', '2,5')
  await retype(user, 'Instructions', 'Soak.\n\nCook.')
  await retype(user, 'Source', ' https://example.com/new ')
  await user.click(await screen.findByRole('button', { name: 'Save' }))

  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent).toEqual([
    {
      name: 'Milk porridge',
      servings: 2,
      sections: [
        {
          name: '',
          items: [
            { ingredient_id: 1, amount: '60', unit: '', original_text: '' },
            { ingredient_id: 2, amount: '200', unit: '', original_text: '' },
          ],
        },
      ],
      instructions: 'Soak.\n\nCook.',
      source_url: 'https://example.com/new',
      extra_tag_ids: [2],
      min_multiplier: '1',
      max_multiplier: '3',
      step: '0.5',
      hard_max_multiplier: '4',
      serving_cap_weight: '2.5',
      new_conversions: [],
    },
  ])
  // back on the spread, showing what was stored
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Milk porridge')
  expect(await screen.findByText('Saved Milk porridge.')).toBeDefined()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Milk porridge' }))
})

test('wrong fields are marked on their fields, the focus goes to the first, and nothing is sent', async () => {
  const { user, calls } = await edit()
  await retype(user, 'Name', '  ')
  await retype(user, 'Serves', '0')
  await retype(user, 'From', '0.0005')
  await retype(user, 'To', 'abc')
  await retype(user, 'Source', 'example.com')
  await user.click(await screen.findByRole('button', { name: 'Save' }))

  expect(errorOn('Name')).toBe('Enter a name.')
  expect(errorOn('Serves')).toBe('Enter a whole number from 1 to 1000.')
  expect(errorOn('From')).toBe('Enter a number above 0, with at most 3 decimals.')
  expect(errorOn('To')).toBe('Enter a number above 0, with at most 3 decimals.')
  expect(errorOn('Source')).toBe('Enter a link that starts with http:// or https://.')
  expect(box('Name').getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(box('Name'))
  expect(calls).not.toContain('PUT /api/recipes/9')

  // a field's error goes as it is changed
  await user.type(box('Name'), 'Oats')
  expect(errorOn('Name')).toBe('')
})

test('the portion size follows the library rules across fields', async () => {
  const { user, calls } = await edit()
  await retype(user, 'From', '1')
  await retype(user, 'To', '0.75')
  await user.click(screen.getByRole('button', { name: 'In steps' }))
  await retype(user, 'In steps of', '0.3')
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  expect(errorOn('From')).toBe('Must be a whole number of steps.')
  expect(errorOn('To')).toBe('Must be at least From.')

  await retype(user, 'To', '2')
  await retype(user, 'In steps of', '0.25')
  const hint = () => document.getElementById(box('Never more than').getAttribute('aria-describedby')!.split(' ')[0]!)
  expect(hint()?.textContent).toBe('Empty: 3 × To, which is 6 ×.')
  expect(box('Never more than').placeholder).toBe('6')
  await retype(user, 'Never more than', '1.5')
  await retype(user, 'Over-size penalty', '-1')
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  expect(errorOn('From')).toBe('')
  expect(errorOn('Never more than')).toBe('Must be at least To.')
  expect(errorOn('Over-size penalty')).toBe('Enter a number, 0 or more.')

  await retype(user, 'In steps of', 'x')
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  expect(errorOn('In steps of')).toBe('Enter a number above 0, with at most 3 decimals.')
  expect(calls).not.toContain('PUT /api/recipes/9')
})

test('the advanced settings open on a mistake in them', async () => {
  const { user } = await edit()
  const details = () => box('Never more than').closest('details')!
  expect(details().open).toBe(false)
  await retype(user, 'Over-size penalty', 'x')
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  expect(details().open).toBe(true)
  expect(document.activeElement).toBe(box('Over-size penalty'))
})

test('a name in use, and the fields the server refuses, are shown on their fields', async () => {
  const { user, router } = await edit({
    'PUT /api/recipes/9': { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] } },
  })
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  await waitFor(() => expect(errorOn('Name')).toBe('A recipe with this name already exists.'))
  expect(where(router)).toBe('/recipes/9')
  expect(box('Name')).toBeDefined() // still in edit mode

  fakeServer({
    ...catalogue,
    'PUT /api/recipes/9': {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'servings'], type: 'less_than_equal', msg: 'big' },
          { loc: ['body', 'max_multiplier'], type: 'below_min', msg: 'low' },
          { loc: ['body', 'source_url'], type: 'invalid_url', msg: 'url' },
          { loc: ['body', 'serving_cap_weight'], type: 'decimal_max_digits', msg: 'long' },
        ],
      },
    },
  })
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  await waitFor(() => expect(errorOn('Serves')).toBe('Enter a whole number from 1 to 1000.'))
  expect(errorOn('Name')).toBe('')
  expect(errorOn('To')).toBe('Must be at least From.')
  expect(errorOn('Source')).toBe('Enter a link that starts with http:// or https://.')
  expect(errorOn('Over-size penalty')).toBe('Use at most 9 digits before the point and 6 after.')
  expect(box('Over-size penalty').closest('details')!.open).toBe(true)
})

test('any other failed save says so and stays in edit mode', async () => {
  const { user } = await edit({ 'PUT /api/recipes/9': 500 })
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  expect((await screen.findByText('Could not save. Try again.')).getAttribute('role')).toBe('alert')
  expect(box('Name')).toBeDefined()
})

test('tags are chips: the ones from the ingredients on, marked auto and locked; the others switch', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...porridge, ...body }))
  const { user } = await edit({ 'PUT /api/recipes/9': handler })
  const chips = within(screen.getByRole('group', { name: 'Tags' }))
  const vegan = chips.getByRole('button', { name: /vegan/ })
  expect(vegan.textContent).toBe('veganauto')
  expect(vegan.getAttribute('aria-pressed')).toBe('true')
  expect((vegan as HTMLButtonElement).disabled).toBe(true)
  expect(chips.getByRole('button', { name: 'quick' }).getAttribute('aria-pressed')).toBe('true')
  expect(chips.getByRole('button', { name: 'contains-nuts' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText(/Tags marked auto come from the ingredients/)).toBeDefined()

  await user.click(chips.getByRole('button', { name: 'quick' }))
  await user.click(chips.getByRole('button', { name: 'contains-nuts' }))
  expect(chips.getByRole('button', { name: 'quick' }).getAttribute('aria-pressed')).toBe('false')
  await user.click(await screen.findByRole('button', { name: 'Save' }))
  await waitFor(() => expect(sent).toMatchObject([{ extra_tag_ids: [3] }]))
})

test('the totals per portion follow the servings as typed', async () => {
  const { user } = await edit()
  const totals = () =>
    within(screen.getByRole('table', { name: 'Per portion' }))
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  expect(totals()).toEqual(['361 kcal', '10.1 g'])
  await retype(user, 'Serves', '2')
  expect(totals()).toEqual(['181 kcal', '5.1 g'])
})

test('Delete asks first, then deletes and goes to the index', async () => {
  const { user, router, calls } = await edit({ 'DELETE /api/recipes/9': 204 })
  await user.click(screen.getByRole('button', { name: 'Delete this recipe' }))
  const question = screen.getByRole('alertdialog', { name: 'Delete Porridge?' })
  expect(question.textContent).toContain('It leaves the recipe index for good.')
  expect(calls).not.toContain('DELETE /api/recipes/9')

  await user.click(within(question).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(where(router)).toBe('/recipes'))
  expect(calls).toContain('DELETE /api/recipes/9')
  expect(await screen.findByText('Deleted Porridge.')).toBeDefined()
  expect(screen.queryByText('Left without saving; the recipe is as it was.')).toBeNull()
})

test('Delete answered with Cancel keeps the recipe; a failed delete says so', async () => {
  const { user, router, calls } = await edit({ 'DELETE /api/recipes/9': 500 })
  await user.click(screen.getByRole('button', { name: 'Delete this recipe' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
  expect(calls).not.toContain('DELETE /api/recipes/9')

  await user.click(screen.getByRole('button', { name: 'Delete this recipe' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect((await screen.findByText('Could not delete. Try again.')).getAttribute('role')).toBe('alert')
  expect(where(router)).toBe('/recipes/9')
})

test('leaving the recipe mid-edit throws the edits away and says so', async () => {
  const { user, router, calls } = await edit()
  await retype(user, 'Name', 'Half done')
  await act(() => router.navigate(`/recipes`))
  expect(await screen.findByText('Left without saving; the recipe is as it was.')).toBeDefined()
  expect(calls.some((call) => call.startsWith('PUT'))).toBe(false)

  await act(() => router.navigate(`/recipes/9`))
  expect((await screen.findByRole('heading', { level: 1, name: 'Porridge' })).textContent).toBe('Porridge')
})

test('leaving the spread outside edit mode says nothing', async () => {
  fakeServer({ 'GET /api/recipes/9': { body: porridge }, ...catalogue })
  const { router } = await mountApp('/recipes/9')
  await screen.findByRole('heading', { level: 1, name: 'Porridge' })
  await act(() => router.navigate(`/recipes`))
  await screen.findByRole('heading', { level: 1, name: /recipe/ })
  expect(screen.getByRole('status').textContent).toBe('')
})

test('New recipe opens a blank spread in edit mode, under the running head New recipe', async () => {
  const calls = fakeServer(catalogue)
  const { user, router } = await mountApp('/recipes/new')
  expect((await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).textContent).toBe('New recipe')
  const masthead = within(document.querySelector<HTMLElement>('.masthead')!)
  await waitFor(() => expect(masthead.getByText('New recipe')).toBeDefined())
  expect(masthead.getByText('3')).toBeDefined()
  expect(document.activeElement).toBe(box('Name'))
  expect([box('Name').value, box('Serves').value, box('From').value, box('To').value]).toEqual(['', '1', '0.5', '2'])
  expect(screen.queryByRole('button', { name: 'Delete this recipe' })).toBeNull()
  expect(screen.getByText('No ingredients yet.')).toBeDefined()

  await user.click(await screen.findByRole('button', { name: 'Save' }))
  expect(errorOn('Name')).toBe('Enter a name.')
  expect(screen.getByText('Add at least one ingredient.')).toBeDefined()
  expect(errorOn('Serves')).toBe('')
  expect(calls).not.toContain('POST /api/recipes')

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(where(router)).toBe('/recipes')
})

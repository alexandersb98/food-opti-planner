import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, conversion, ingredient, ingredientSource, lines, recipe, tag } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The ingredient page (stories 155–157, 161, 162), ported from the Vue
// IngredientPage and IngredientForm tests. The unit-change question
// (ticket 37), conversions (ticket 30) and the source link (ticket 31) are
// tested by their tickets.

afterEach(() => {
  vi.unstubAllGlobals()
})

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal', ingredient_count: 1 })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1, ingredient_count: 1 })
const fat = attribute({ id: 3, name: 'Fat', unit: 'g', decimals: 1 })
const vegan = tag({ id: 1, name: 'vegan', ingredient_count: 1 })
const nuts = tag({ id: 2, name: 'contains-nuts', derive: 'any' })
const oats = ingredient({
  id: 7,
  name: 'Oats',
  values: [
    { attribute_id: 1, value: '389' },
    { attribute_id: 2, value: '16.9' },
  ],
  tag_ids: [1],
})

async function mountPage(path: string, server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/counts': { body: { recipes: 1, ingredients: 1, attributes: 3, tags: 2 } },
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy, protein, fat] },
    'GET /api/tags': { body: [vegan, nuts] },
    'GET /api/ingredients/7': { body: oats },
    'GET /api/ingredients': { body: [] },
    // another spelling of the same unit: no question (its tests are in UnitChange.test.tsx)
    'POST /api/ingredients/7/unit-change': { body: { kind: 'same', factor: null, counts: {}, rounded: 0, refusal: null } },
    ...server,
  })
  const app = await mountApp(path)
  await screen.findByRole('heading', { level: 1 }, { timeout: 3000 })
  return { ...app, calls }
}

/** Mounts the page and waits for the form. */
async function openForm(path: string, server: FakeServer = {}) {
  const page = await mountPage(path, server)
  await screen.findByRole('textbox', { name: 'Name' })
  // the unit catalogue and the preferences are in
  await waitFor(() => expect(page.calls).toContain('GET /api/units'))
  return page
}

type Page = Awaited<ReturnType<typeof mountPage>>

function where(router: Page['router']) {
  return router.state.location.pathname
}

function box(name: string) {
  return screen.getByRole<HTMLInputElement>(name === 'Measured in' ? 'combobox' : 'textbox', { name })
}

function value(name: string) {
  return box(name).value
}

async function type(page: Page, name: string, text: string) {
  await page.user.clear(box(name))
  if (text) await page.user.type(box(name), text)
}

async function chooseUnit(page: Page, option: string) {
  await page.user.click(box('Measured in'))
  await page.user.click(await screen.findByRole('option', { name: option }))
}

/** The chosen tags' chips, and the others offered under "Add a tag". */
function tags() {
  const names = (name: string) =>
    within(screen.getByRole('group', { name }))
      .getAllByRole('button')
      .map((chip) => chip.textContent)
  return { chosen: names('Tags'), others: names('Other tags') }
}

function save(page: Page) {
  return page.user.click(screen.getByRole('button', { name: 'Save' }))
}

/** The error a field shows (its aria-describedby text). */
function errorOf(name: string) {
  const ids = box(name).getAttribute('aria-describedby') ?? ''
  return ids
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

/** A save request's bodies, recorded. */
function recorder(status: number, reply: (body: object) => object) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: reply(body as object) }
  }
  return { sent, handler }
}

test('an ingredient opens with its fields, values and tags', async () => {
  await openForm('/ingredients/7')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit ingredient')
  expect([value('Name'), value('Measured in'), value('Value basis')]).toEqual(['Oats', 'g', '100'])
  expect([value('Energy'), value('Protein'), value('Fat')]).toEqual(['389', '16.9', ''])
  expect(document.body.textContent).toContain('kcal')
  expect(tags()).toEqual({ chosen: ['vegan'], others: ['contains-nuts'] })
  expect(document.body.textContent).toContain('Used in no recipes')
  expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
})

test('Save sends the typed values, leaving out empty ones, and returns to the list', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...oats, ...body }))
  const page = await openForm('/ingredients/7', { 'PUT /api/ingredients/7': handler })
  await type(page, 'Name', 'Rolled oats')
  await type(page, 'Energy', '')
  await type(page, 'Fat', ' 6,5 ')
  await page.user.click(screen.getByRole('button', { name: 'vegan' }))
  await page.user.click(screen.getByRole('button', { name: 'contains-nuts' }))
  await save(page)
  expect(sent).toEqual([
    {
      name: 'Rolled oats',
      unit: 'g',
      basis: '100',
      values: [
        { attribute_id: 2, value: '16.9' },
        { attribute_id: 3, value: '6.5' },
      ],
      tag_ids: [2],
    },
  ])
  await waitFor(() => expect(where(page.router)).toBe('/ingredients'))
  expect(await screen.findByText('Saved Rolled oats.')).toBeDefined()
})

test('a new ingredient starts in grams per 100, and the basis follows the unit', async () => {
  const { sent, handler } = recorder(201, (body) => ({ ...ingredient({ id: 8, name: '' }), ...body }))
  const page = await openForm('/ingredients/new', { 'POST /api/ingredients': handler })
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New ingredient')
  expect([value('Name'), value('Measured in'), value('Value basis')]).toEqual(['', 'g', '100'])
  expect(document.activeElement).toBe(box('Name'))
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  expect(document.body.textContent).not.toContain('Used in')

  await type(page, 'Measured in', 'st')
  expect([value('Measured in'), value('Value basis')]).toEqual(['st', '1'])
  await type(page, 'Measured in', 'ml')
  expect(value('Value basis')).toBe('100')
  await type(page, 'Measured in', 'msk')
  expect(value('Value basis')).toBe('100')
  await type(page, 'Measured in', 'st')
  expect(value('Value basis')).toBe('1')

  await type(page, 'Name', 'Egg')
  await chooseUnit(page, 'g (gram)')
  await chooseUnit(page, 'st (piece)')
  expect([value('Measured in'), value('Value basis')]).toEqual(['st', '1'])
  await type(page, 'Protein', '6.3')
  await save(page)
  expect(sent).toEqual([{ name: 'Egg', unit: 'st', basis: '1', values: [{ attribute_id: 2, value: '6.3' }], tag_ids: [] }])
  await waitFor(() => expect(where(page.router)).toBe('/ingredients'))
})

test('a new ingredient starts in the preferred mass unit', async () => {
  await openForm('/ingredients/new', unitRoutes({ 'unit.mass': 'kg' }))
  expect([value('Measured in'), value('Value basis')]).toEqual(['kg', '100'])
})

test('without the preferences a new ingredient starts in grams and the page still saves', async () => {
  const { sent, handler } = recorder(201, (body) => ({ ...ingredient({ id: 8, name: '' }), ...body }))
  const page = await openForm('/ingredients/new', { 'GET /api/preferences': 500, 'POST /api/ingredients': handler })
  expect([value('Measured in'), value('Value basis')]).toEqual(['g', '100'])
  await type(page, 'Name', 'Egg')
  await save(page)
  expect(sent).toEqual([{ name: 'Egg', unit: 'g', basis: '100', values: [], tag_ids: [] }])
})

test('a unit chosen from the list is sent as its symbol, typed text as typed', async () => {
  const { sent, handler } = recorder(200, (body) => ({ ...oats, ...body }))
  const page = await openForm('/ingredients/7', { 'PUT /api/ingredients/7': handler })
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  expect((sent[0] as { unit: string }).unit).toBe('kg')
  page.unmount()

  const second = await openForm('/ingredients/7', { 'PUT /api/ingredients/7': handler })
  await type(second, 'Measured in', 'gram')
  await save(second)
  expect((sent[1] as { unit: string }).unit).toBe('gram')
})

test('the unit list offers mass, volume and pieces, not energy, the preferred unit first', async () => {
  const page = await openForm('/ingredients/new', unitRoutes({ 'unit.mass': 'kg' }))
  await page.user.click(box('Measured in'))
  const list = await screen.findByRole('listbox', { name: 'Measured in' })
  const groups = within(list).getAllByRole('group')
  expect(groups.map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
    'Mass',
    'Volume',
    'Other',
  ])
  expect(within(groups[0]!).getAllByRole('option')[0]!.textContent).toBe('kg (kilogram)')
  expect(within(list).getByRole('option', { name: 'st (piece)' })).toBeDefined()
  expect(within(list).queryByRole('option', { name: 'kcal (kilocalorie)' })).toBeNull()
})

test('an energy unit the server refuses is shown under the field until the unit changes', async () => {
  const refusal = { status: 422, body: { detail: [{ loc: ['body', 'unit'], type: 'unit_not_for_ingredient', msg: 'x' }] } }
  const page = await openForm('/ingredients/new', { 'POST /api/ingredients': refusal })
  await type(page, 'Name', 'Oil')
  await type(page, 'Measured in', 'kcal')
  await save(page)
  const text = 'An ingredient is measured in an amount of food, such as g, dl or pieces.'
  expect(errorOf('Measured in')).toContain(text)
  expect(box('Measured in').getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(box('Measured in'))
  expect(document.body.textContent).not.toContain('Could not save')
  expect(where(page.router)).toBe('/ingredients/new')
  await type(page, 'Measured in', 'g')
  expect(document.body.textContent).not.toContain(text)
})

test('without the catalogue the basis still follows g', async () => {
  const page = await mountPage('/ingredients/new', { 'GET /api/units': 500 })
  await screen.findByRole('textbox', { name: 'Name' })
  await type(page, 'Measured in', 'st')
  expect(value('Value basis')).toBe('1')
})

test('a basis changed by hand stays when the unit changes', async () => {
  const page = await openForm('/ingredients/new')
  await type(page, 'Value basis', '50')
  await chooseUnit(page, 'st (piece)')
  expect(value('Value basis')).toBe('50')
})

test('an existing basis is kept when the ingredient is opened', async () => {
  await openForm('/ingredients/7', { 'GET /api/ingredients/7': { body: { ...oats, unit: 'pcs', basis: '100' } } })
  expect([value('Measured in'), value('Value basis')]).toEqual(['pcs', '100'])
})

test('wrong fields are marked, the first gets focus, and nothing is sent', async () => {
  const page = await openForm('/ingredients/7')
  await type(page, 'Name', ' ')
  await type(page, 'Measured in', '')
  await type(page, 'Value basis', '0')
  await type(page, 'Fat', 'a lot')
  await save(page)
  expect(errorOf('Name')).toBe('Enter a name.')
  expect(errorOf('Measured in')).toBe('Enter a unit.')
  expect(errorOf('Value basis')).toBe('Enter a number above 0.')
  expect(errorOf('Fat')).toBe('Enter a number, or leave it empty.')
  expect(box('Fat').getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(box('Name'))
  expect(page.calls).not.toContain('PUT /api/ingredients/7')

  // an edited field drops its mark
  await type(page, 'Fat', '6')
  expect(box('Fat').getAttribute('aria-invalid')).toBeNull()
})

test('a name in use, and a number the server finds too long, are shown on their fields', async () => {
  const page = await openForm('/ingredients/7', {
    'PUT /api/ingredients/7': { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] } },
  })
  await save(page)
  expect(errorOf('Name')).toBe('An ingredient with this name already exists.')
  expect(where(page.router)).toBe('/ingredients/7')

  fakeServer({
    'PUT /api/ingredients/7': {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'basis'], type: 'decimal_max_places', msg: 'long' },
          { loc: ['body', 'values', 1, 'value'], type: 'decimal_max_places', msg: 'long' },
        ],
      },
    },
  })
  await type(page, 'Protein', '16.0000001')
  await save(page)
  expect(errorOf('Protein')).toBe('Use at most 9 digits before the point and 6 after.')
  expect(errorOf('Value basis')).toBe('Use at most 9 digits before the point and 6 after.')
  expect(errorOf('Name')).toBe('')
})

test('a linked ingredient offers only mass units and shows a non-mass refusal under the unit', async () => {
  const linked = { ...oats, source: ingredientSource() }
  const page = await openForm('/ingredients/7', {
    'GET /api/ingredients/7': { body: linked },
    'PUT /api/ingredients/7': { status: 422, body: { detail: [{ loc: ['body', 'unit'], type: 'unit_not_for_source', msg: 'x' }] } },
  })
  await page.user.click(box('Measured in'))
  const list = await screen.findByRole('listbox', { name: 'Measured in' })
  expect(within(list).getAllByRole('group')).toHaveLength(1)
  expect(within(list).queryByRole('option', { name: 'dl (decilitre)' })).toBeNull()
  await page.user.keyboard('{Escape}')
  await type(page, 'Measured in', 'dl')
  await save(page)
  expect(errorOf('Measured in')).toContain('An ingredient from a data source can only be measured in a mass unit')
})

test('a unit change the save refuses shows the server sentence under the unit', async () => {
  const sentence = 'Oats has 2 recipe lines in dl.'
  const page = await openForm('/ingredients/7', {
    'PUT /api/ingredients/7': { status: 422, body: { detail: [{ loc: ['body', 'unit'], type: 'unit_has_dependents', msg: sentence }] } },
  })
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  expect(errorOf('Measured in')).toBe(sentence)
})

test('any other failed save says so', async () => {
  const page = await openForm('/ingredients/7', { 'PUT /api/ingredients/7': 500 })
  await save(page)
  expect((await screen.findByText('Could not save. Try again.')).getAttribute('role')).toBe('alert')
  expect(where(page.router)).toBe('/ingredients/7')
})

test('delete asks first, then deletes and returns to the list', async () => {
  const page = await openForm('/ingredients/7', { 'DELETE /api/ingredients/7': 204 })
  await page.user.click(screen.getByRole('button', { name: 'Delete' }))
  const question = await screen.findByRole('alertdialog', { name: 'Delete Oats?' })
  expect(question.textContent).toContain('Nothing else uses it.')
  expect(page.calls).not.toContain('DELETE /api/ingredients/7')
  await page.user.click(within(question).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(where(page.router)).toBe('/ingredients'))
  expect(page.calls).toContain('DELETE /api/ingredients/7')
  expect(await screen.findByText('Deleted Oats.')).toBeDefined()
})

test('cancelling the delete sends nothing, and a failed delete says so', async () => {
  const page = await openForm('/ingredients/7', { 'DELETE /api/ingredients/7': 500 })
  await page.user.click(screen.getByRole('button', { name: 'Delete' }))
  await page.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
  expect(page.calls).not.toContain('DELETE /api/ingredients/7')

  await page.user.click(screen.getByRole('button', { name: 'Delete' }))
  await page.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect((await screen.findByText('Could not delete. Try again.')).getAttribute('role')).toBe('alert')
  expect(where(page.router)).toBe('/ingredients/7')
})

test('the delete confirmation names the conversions that go with the ingredient', async () => {
  const withConversions = {
    ...oats,
    conversions: [conversion({ id: 1, unit: 'dl', factor: '40' }), conversion({ id: 2, unit: 'msk', factor: '6' })],
  }
  const page = await openForm('/ingredients/7', { 'GET /api/ingredients/7': { body: withConversions } })
  await page.user.click(screen.getByRole('button', { name: 'Delete' }))
  const question = await screen.findByRole('alertdialog', { name: 'Delete Oats?' })
  expect(question.textContent).toContain('This also removes its 2 conversions.')
  expect(within(question).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1 dl = 40 g', '1 msk = 6 g'])
})

test('an ingredient recipes use cannot be deleted', async () => {
  await openForm('/ingredients/7', { 'GET /api/ingredients/7': { body: { ...oats, recipe_count: 2 } } })
  const remove = screen.getByRole('button', { name: 'Delete' })
  expect(remove.hasAttribute('disabled')).toBe(true)
  expect(document.body.textContent).toContain('Used in 2 recipes')
  expect(document.getElementById(remove.getAttribute('aria-describedby')!)?.textContent).toBe(
    "Recipes use it, so it can’t be deleted.",
  )
})

test('Show lists the recipes that use the ingredient, which open their spread', async () => {
  const uses = (id: number, name: string, ingredientId: number) => recipe({ id, name, sections: lines([ingredientId, '1']) })
  const page = await openForm('/ingredients/7', {
    'GET /api/ingredients/7': { body: { ...oats, recipe_count: 2 } },
    'GET /api/recipes': { body: [uses(1, 'Porridge', 7), uses(2, 'Omelette', 8), uses(3, 'Muesli', 7)] },
  })
  await page.user.click(screen.getByRole('button', { name: 'Show' }))
  const list = await screen.findByRole('list', { name: 'Recipes that use Oats' })
  expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Muesli', 'Porridge'])
  expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
  await page.user.click(within(list).getByRole('link', { name: 'Muesli' }))
  expect(where(page.router)).toBe('/recipes/3')
})

test('Show lists a recipe that has the ingredient only in a second section', async () => {
  const layered = recipe({
    id: 4,
    name: 'Layered',
    sections: [
      { name: 'Base', items: [{ ingredient_id: 8, amount: '1', unit: '', original_text: '' }] },
      { name: 'Top', items: [{ ingredient_id: 7, amount: '2', unit: '', original_text: '' }] },
    ],
  })
  const page = await openForm('/ingredients/7', {
    'GET /api/ingredients/7': { body: { ...oats, recipe_count: 1 } },
    'GET /api/recipes': { body: [layered] },
  })
  await page.user.click(screen.getByRole('button', { name: 'Show' }))
  const list = await screen.findByRole('list', { name: 'Recipes that use Oats' })
  expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Layered'])
})

test('recipes that fail to load say so and Show stays', async () => {
  const page = await openForm('/ingredients/7', {
    'GET /api/ingredients/7': { body: { ...oats, recipe_count: 1 } },
    'GET /api/recipes': 500,
  })
  await page.user.click(screen.getByRole('button', { name: 'Show' }))
  expect((await screen.findByText('Could not load the recipes.')).getAttribute('role')).toBe('alert')
  expect(screen.getByRole('button', { name: 'Show' })).toBeDefined()
})

test('without attributes or tags, the page says where to add them', async () => {
  await openForm('/ingredients/new', { 'GET /api/attributes': { body: [] }, 'GET /api/tags': { body: [] } })
  expect(document.body.textContent).toContain('No attributes yet; add them on the Attributes page.')
  expect(document.body.textContent).toContain('No tags yet; add them on the Tags page.')
})

test('a new ingredient says to save before adding conversions; a saved one leaves the place to its conversions', async () => {
  const page = await openForm('/ingredients/new')
  expect(screen.getByRole('heading', { name: 'Conversions' })).toBeDefined()
  expect(document.body.textContent).toContain('Save the ingredient to add conversions.')
  page.unmount()

  await openForm('/ingredients/7')
  expect(document.body.textContent).not.toContain('Save the ingredient to add conversions.')
})

test('an unknown ingredient fails to load', async () => {
  fakeServer({ 'GET /api/session': 204, 'GET /api/counts': { body: {} }, ...unitRoutes(), 'GET /api/attributes': { body: [] }, 'GET /api/tags': { body: [] } })
  await mountApp('/ingredients/99')
  expect(await screen.findByText('Could not load the ingredient.')).toBeDefined()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined()
})

test('the back link returns to the list without saving', async () => {
  const page = await openForm('/ingredients/7')
  await type(page, 'Name', 'Changed')
  await page.user.click(screen.getByRole('link', { name: 'Back to Ingredients' }))
  expect(where(page.router)).toBe('/ingredients')
  expect(page.calls).not.toContain('PUT /api/ingredients/7')
})

test('the running head names the ingredient, on the Ingredients folio', async () => {
  const page = await openForm('/ingredients/7')
  await waitFor(() => expect(within(screen.getByRole('banner')).queryByText('Oats')).not.toBeNull())
  expect(within(screen.getByRole('banner')).getByText('5')).toBeDefined()
  page.unmount()

  await openForm('/ingredients/new')
  expect(within(screen.getByRole('banner')).getByText('Ingredients')).toBeDefined()
  expect(within(screen.getByRole('banner')).getByText('5')).toBeDefined()
})

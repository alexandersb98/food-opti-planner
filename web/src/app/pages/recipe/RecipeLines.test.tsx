import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Recipe } from '../../../api/types'
import { attribute, conversion, ingredient, lines, recipe, tag } from '../../../test-data'
import { BASE_PATH } from '../../base'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The line editor in the spread's edit mode (ticket 33): the parity
// checklist is the Vue RecipeSection, LineUnitPicker and IngredientPicker
// tests and the line tests of the Vue RecipePage.

afterEach(() => {
  vi.unstubAllGlobals()
})

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 })
const vegan = tag({ id: 1, name: 'vegan' })
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
const almonds = ingredient({ id: 3, name: 'Almonds', values: [{ attribute_id: 2, value: '21' }], tag_ids: [1, 3] })
const porridge = recipe({ id: 9, name: 'Porridge', sections: lines([1, '60'], [2, '200']), derived_tag_ids: [1] })
const layered = recipe({
  id: 9,
  name: 'Layered',
  sections: [
    { name: 'Base', items: [{ ingredient_id: 1, amount: '200', unit: '', original_text: '200 g oats' }] },
    { name: 'Topping', items: [{ ingredient_id: 3, amount: '40', unit: '', original_text: '' }] },
  ],
})
const withUnits = (items: { ingredient_id: number; amount: string; unit: string }[]): Recipe['sections'] => [
  { name: '', items: items.map((item) => ({ ...item, original_text: '' })) },
]

const catalogue: FakeServer = {
  'GET /api/session': 204,
  'GET /api/attributes': { body: [energy, protein] },
  'GET /api/tags': { body: [vegan, nuts] },
  'GET /api/ingredients': { body: [oats, milk, almonds] },
  'GET /api/recipes': { body: [] },
  'POST /api/recipes/derived-tags': { body: [] },
  ...unitRoutes(),
}

/** The spread of recipe 9 (porridge unless `server` says otherwise), in edit mode. */
async function edit(server: FakeServer = {}) {
  const calls = fakeServer({ 'GET /api/recipes/9': { body: porridge }, ...catalogue, ...server })
  const app = await mountApp('/recipes/9')
  await app.user.click(await screen.findByRole('button', { name: /^Edit / }, { timeout: 5000 }))
  return { ...app, calls }
}

async function newRecipe(server: FakeServer = {}) {
  const calls = fakeServer({ ...catalogue, ...server })
  const app = await mountApp('/recipes/new')
  await screen.findByRole('heading', { level: 1, name: 'New recipe' }, { timeout: 5000 })
  return { ...app, calls }
}

type User = Awaited<ReturnType<typeof edit>>['user']

/** A request's bodies, recorded, and the reply. */
function recorder(status: number, reply: (body: object) => object) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: reply(body as object) }
  }
  return { sent, handler }
}

const region = () => within(screen.getByRole('region', { name: 'Ingredients' }))
const amount = (name: string, index = 0) => region().getAllByRole<HTMLInputElement>('textbox', { name: `Amount of ${name}` })[index]!
const unit = (name: string, index = 0) => region().getAllByRole<HTMLSelectElement>('combobox', { name: `Unit of ${name}` })[index]!

/** Each line: its name and amount. */
function rows() {
  return [...document.querySelectorAll('.lines-line')].map((li) => [
    li.querySelector('.lines-name')!.textContent,
    li.querySelector<HTMLInputElement>('.lines-amount')!.value,
  ])
}

/** The names of the lines, per section. */
function bySection() {
  return [...document.querySelectorAll('.lines-section')].map((section) =>
    [...section.querySelectorAll('.lines-name')].map((name) => name.textContent),
  )
}

const sectionNames = () => region().queryAllByRole<HTMLInputElement>('textbox', { name: /^Name of section/ }).map((box) => box.value)

function totals() {
  return within(screen.getByRole('table', { name: 'Per portion' }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

/** The text of what describes a control (its error or note). */
function describing(control: HTMLElement) {
  return (control.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

async function retype(user: User, box: HTMLInputElement, text: string) {
  await user.clear(box)
  if (text) await user.paste(text)
}

/** Open the picker with "Add a line…" (`button`), search, and pick `name`. */
async function pickLine(user: User, name: string, { button = 'Add a line', search = '' } = {}) {
  await user.click(screen.getByRole('button', { name: button }))
  const sheet = await screen.findByRole('dialog')
  if (search) await user.type(within(sheet).getByRole('searchbox', { name: 'Find an ingredient' }), search)
  await user.click(within(sheet).getByRole('button', { name: new RegExp(`^${name}`) }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

/** The picker's rows, by accessible name. */
const pickerRows = (sheet: HTMLElement) =>
  within(sheet)
    .queryAllByRole('listitem')
    .map((li) => within(li).getByRole('button').textContent)

test('each line is annotated: its amount, its unit, its name and ×; the totals follow amounts as typed', async () => {
  const { user } = await edit()
  expect(rows()).toEqual([
    ['Oats', '60'],
    ['Milk', '200'],
  ])
  expect([unit('Oats').value, unit('Milk').value]).toEqual(['', ''])
  expect(screen.getByRole('button', { name: 'Remove Oats' })).toBeDefined()
  // one unnamed section: no heading, no line menu, no "Remove this section"
  expect(sectionNames()).toEqual([])
  expect(screen.queryByRole('button', { name: 'Line menu for Oats' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Remove this section/ })).toBeNull()
  expect(totals()).toEqual(['361 kcal', '10.1 g'])

  await retype(user, amount('Oats'), '100')
  expect(totals()).toEqual(['517 kcal', '16.9 g'])
  await retype(user, amount('Milk'), '0,5')
  expect(totals()).toEqual(['389 kcal', '16.9 g'])
  await retype(user, amount('Milk'), 'a lot')
  expect(totals()).toEqual(['389 kcal', '16.9 g'])
})

test('a unit offers the own unit, the units that convert and the conversions (the AI one marked), then New unit…', async () => {
  const oatsWithConversions = {
    ...oats,
    conversions: [conversion({ id: 1, unit: 'dl', factor: '40' }), conversion({ id: 2, unit: 'st', factor: '5', source: 'ai' })],
  }
  await edit({ 'GET /api/ingredients': { body: [oatsWithConversions, milk, almonds] } })
  const select = unit('Oats')
  const groups = [...select.querySelectorAll('optgroup')].map((group) => [
    group.label,
    [...group.querySelectorAll('option')].map((option) => option.textContent),
  ])
  expect(groups[0]).toEqual(["Ingredient's unit", ['g']])
  expect(groups[1]![0]).toBe('Other units')
  // mass units, and with the dl conversion the volume units too, but not dl itself
  expect(groups[1]![1]).toEqual(expect.arrayContaining(['kg (kilogram)', 'ml (millilitre)', 'l (litre)']))
  expect(groups[1]![1]).not.toContain('dl (decilitre)')
  expect(groups[2]).toEqual(['Conversions', ['dl = 40 g', 'st = 5 g ✨ suggested by AI']])
  expect(select.options[select.options.length - 1]!.textContent).toBe('New unit…')

  // a piece-less ml ingredient offers no mass units
  const milkGroups = [...unit('Milk').querySelectorAll('optgroup')].map((group) => group.label)
  expect(milkGroups).toEqual(["Ingredient's unit", 'Other units'])
  expect([...unit('Milk').options].map((o) => o.textContent)).not.toContain('g (gram)')
})

test('choosing a unit changes the line and the totals; the own unit is sent empty', async () => {
  const put = recorder(200, (body) => ({ ...porridge, ...body }))
  const { user } = await edit({ 'PUT /api/recipes/9': put.handler })
  await user.selectOptions(unit('Oats'), 'kg (kilogram)')
  expect(unit('Oats').value).toBe('kg')
  expect(unit('Oats').closest('.lines-unit')!.textContent).toContain('kg')
  // 60 kg of oats and 200 ml of milk
  expect(totals()).toEqual(['233528 kcal', '10140 g'])
  await user.selectOptions(unit('Milk'), 'dl (decilitre)')
  await user.selectOptions(unit('Milk'), 'ml')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(put.sent).toHaveLength(1))
  const [sent] = put.sent as { sections: { items: { unit: string }[] }[] }[]
  expect(sent!.sections[0]!.items.map((item) => item.unit)).toEqual(['kg', ''])
})

test('Add a line opens the picker, A to Z; picking adds the line, focuses its amount and asks for the tags', async () => {
  const derived = recorder(200, (body) => ((body as { ingredient_ids: number[] }).ingredient_ids.includes(3) ? [1, 3] : [1]))
  const { user } = await edit({ 'POST /api/recipes/derived-tags': derived.handler })
  await user.click(screen.getByRole('button', { name: 'Add a line' }))
  const sheet = await screen.findByRole('dialog', { name: 'Add an ingredient' })
  await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByRole('searchbox', { name: 'Find an ingredient' })))
  expect(pickerRows(sheet)).toEqual(['Almonds g', 'Milk ml', 'Oats g'])

  await user.type(within(sheet).getByRole('searchbox'), 'alm')
  expect(pickerRows(sheet)).toEqual(['Almonds g'])
  await user.click(within(sheet).getByRole('button', { name: /^Almonds/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(rows()).toEqual([
    ['Oats', '60'],
    ['Milk', '200'],
    ['Almonds', ''],
  ])
  expect(document.activeElement).toBe(amount('Almonds'))
  await waitFor(() => expect(derived.sent).toEqual([{ ingredient_ids: [1, 2, 3] }]))
  const contains = within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: /contains-nuts/ })
  await waitFor(() => expect(contains.getAttribute('aria-pressed')).toBe('true'))
})

test('the same ingredient can be picked for a second line; the picker still offers it and starts afresh', async () => {
  const { user } = await edit()
  await pickLine(user, 'Oats', { search: 'oa' })
  expect(rows()).toEqual([
    ['Oats', '60'],
    ['Milk', '200'],
    ['Oats', ''],
  ])
  // an empty amount counts for nothing in the totals
  expect(totals()).toEqual(['361 kcal', '10.1 g'])
  await retype(user, amount('Oats', 1), '40')
  expect(totals()).toEqual(['517 kcal', '16.9 g'])

  await user.click(screen.getByRole('button', { name: 'Add a line' }))
  const sheet = await screen.findByRole('dialog')
  expect(within(sheet).getByRole<HTMLInputElement>('searchbox').value).toBe('')
  expect(pickerRows(sheet)).toEqual(['Almonds g', 'Milk ml', 'Oats g'])
  await user.type(within(sheet).getByRole('searchbox'), 'kale')
  expect(within(sheet).getByText('No ingredient is called “kale”. Add it on the Ingredients page first.')).toBeDefined()
  await user.clear(within(sheet).getByRole('searchbox'))
  expect(pickerRows(sheet)).toHaveLength(3)
})

test('× removes a line, says so and leaves the focus on Add a line', async () => {
  const { user } = await edit()
  await user.click(screen.getByRole('button', { name: 'Remove Milk' }))
  expect(rows()).toEqual([['Oats', '60']])
  expect(totals()).toEqual(['233 kcal', '10.1 g'])
  expect(await screen.findByText('Removed Milk.')).toBeDefined()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a line' }))
})

test('Add a section names both; saving without names is refused on each field, and typing a name clears it', async () => {
  const { user, calls } = await edit()
  await user.click(screen.getByRole('button', { name: 'Add a section' }))
  expect(sectionNames()).toEqual(['', ''])
  expect(document.activeElement).toBe(region().getByRole('textbox', { name: 'Name of section 1' }))
  expect(screen.getByRole('button', { name: 'Add a line to “Section 2”' })).toBeDefined()
  expect(screen.getAllByText('No ingredients yet.')).toHaveLength(1)

  await user.click(screen.getByRole('button', { name: 'Save' }))
  const first = region().getByRole('textbox', { name: 'Name of section 1' })
  const second = region().getByRole('textbox', { name: 'Name of section 2' })
  expect([describing(first), describing(second)]).toEqual(['Name every section.', 'Name every section.'])
  expect(first.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(first)
  expect(calls).not.toContain('PUT /api/recipes/9')

  await user.type(first, 'Porridge')
  expect(describing(first)).toBe('')
  expect(describing(second)).toBe('Name every section.')
  expect(screen.getByRole('button', { name: 'Add a line to “Porridge”' })).toBeDefined()
})

test('a line moves to another section from its line menu', async () => {
  const { user } = await edit({ 'GET /api/recipes/9': { body: layered } })
  expect(sectionNames()).toEqual(['Base', 'Topping'])
  await user.click(screen.getByRole('button', { name: 'Line menu for Oats' }))
  const sheet = await screen.findByRole('dialog', { name: 'Move Oats' })
  expect(within(sheet).getAllByRole('button', { name: /^Move to/ }).map((b) => b.textContent)).toEqual(['Move to Topping'])
  await user.click(within(sheet).getByRole('button', { name: 'Move to Topping' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(bySection()).toEqual([[], ['Almonds', 'Oats']])
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Line menu for Oats' }))
  expect(await screen.findByText('Moved Oats to Topping.')).toBeDefined()
})

test('removing a section moves its lines up and keeps every line', async () => {
  const put = recorder(200, (body) => ({ ...layered, ...body }))
  const { user } = await edit({ 'GET /api/recipes/9': { body: layered }, 'PUT /api/recipes/9': put.handler })
  const topping = screen.getByRole('group', { name: 'Topping' })
  await user.click(within(topping).getByRole('button', { name: /Remove this section/ }))
  expect(sectionNames()).toEqual(['Base'])
  expect(bySection()).toEqual([['Oats', 'Almonds']])
  expect(screen.queryByRole('button', { name: /Remove this section/ })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a line to “Base”' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(put.sent).toMatchObject([
      {
        sections: [
          {
            name: 'Base',
            items: [
              { ingredient_id: 1, amount: '200', unit: '', original_text: '200 g oats' },
              { ingredient_id: 3, amount: '40', unit: '', original_text: '' },
            ],
          },
        ],
      },
    ]),
  )
})

test('the picker adds to the section whose button was pressed', async () => {
  const { user } = await edit({ 'GET /api/recipes/9': { body: layered } })
  await pickLine(user, 'Milk', { button: 'Add a line to “Topping”' })
  expect(bySection()).toEqual([['Oats'], ['Almonds', 'Milk']])
})

test('a line whose unit does not convert says why, is left out of the totals, and Save sends nothing', async () => {
  const stale = recipe({ id: 9, name: 'Porridge', sections: withUnits([{ ingredient_id: 1, amount: '1', unit: 'dl' }]) })
  const put = recorder(200, () => stale)
  const { user } = await edit({ 'GET /api/recipes/9': { body: stale }, 'PUT /api/recipes/9': put.handler })
  expect(unit('Oats').value).toBe('dl')
  expect(unit('Oats').selectedOptions[0]!.textContent).toBe('dl (doesn’t convert)')
  expect(describing(unit('Oats'))).toBe('dl doesn’t convert to g, so this line is left out of the totals.')
  expect(totals()).toEqual(['0 kcal', '0 g'])

  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(describing(unit('Oats'))).toBe("dl of Oats doesn't convert. Pick another unit or add a conversion.")
  expect(unit('Oats').getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(unit('Oats'))
  expect(put.sent).toEqual([])

  // another unit answers it
  await user.selectOptions(unit('Oats'), 'kg (kilogram)')
  expect(describing(unit('Oats'))).toBe('')
  expect(unit('Oats').hasAttribute('aria-invalid')).toBe(false)
})

test('New unit… adds a conversion, gives it to the line and counts it; a new recipe then saves end to end', async () => {
  const posted = recorder(201, () => conversion({ id: 5, unit: 'dl', factor: '40' }))
  const stored = recipe({ id: 12, name: 'Overnight oats', sections: withUnits([{ ingredient_id: 1, amount: '1', unit: 'dl' }]) })
  const saved = recorder(201, () => stored)
  const { user, router, calls } = await newRecipe({
    'POST /api/ingredients/1/conversions': posted.handler,
    'POST /api/recipes': saved.handler,
    'GET /api/recipes/12': { body: stored },
  })
  // no lines yet: said on Save, gone once a line is added
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByText('Add at least one ingredient.')).toBeDefined()
  await pickLine(user, 'Oats')
  expect(screen.queryByText('Add at least one ingredient.')).toBeNull()

  await user.type(amount('Oats'), '1')
  await user.selectOptions(unit('Oats'), 'New unit…')
  const sheet = await screen.findByRole('dialog', { name: 'New unit' })
  expect(unit('Oats').value).toBe('')
  await user.type(within(sheet).getByRole('combobox', { name: 'Unit' }), 'dl')
  await user.type(within(sheet).getByRole('textbox', { name: 'How many g one makes' }), '40')
  await user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(posted.sent).toEqual([{ unit: 'dl', factor: '40' }])
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(unit('Oats').value).toBe('dl')
  expect(unit('Oats').selectedOptions[0]!.textContent).toBe('dl = 40 g')
  // 1 dl of 40 g per dl: 40 g of oats
  expect(totals()).toEqual(['156 kcal', '6.8 g'])
  expect(document.activeElement).toBe(unit('Oats'))
  // the recipe's own form was not sent with the conversion
  expect(calls).not.toContain('POST /api/recipes')

  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Overnight oats')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved.sent).toHaveLength(1))
  expect(saved.sent).toMatchObject([
    {
      name: 'Overnight oats',
      servings: 1,
      sections: [{ name: '', items: [{ ingredient_id: 1, amount: '1', unit: 'dl', original_text: '' }] }],
      new_conversions: [],
    },
  ])
  await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE_PATH}/recipes/12`))
  expect((await screen.findByRole('heading', { level: 1, name: 'Overnight oats' })).textContent).toBe('Overnight oats')
})

test('a stale unit starts the New unit sheet with that unit', async () => {
  const stale = recipe({ id: 9, name: 'Porridge', sections: withUnits([{ ingredient_id: 1, amount: '1', unit: 'dl' }]) })
  const { user } = await edit({ 'GET /api/recipes/9': { body: stale } })
  await user.selectOptions(unit('Oats'), 'New unit…')
  const sheet = await screen.findByRole('dialog', { name: 'New unit' })
  expect(within(sheet).getByRole<HTMLInputElement>('combobox', { name: 'Unit' }).value).toBe('dl')
})

test('an amount that is not a number is marked on its line, and goes as it is retyped', async () => {
  const { user, calls } = await edit()
  await retype(user, amount('Milk'), '')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(describing(amount('Milk'))).toBe('Enter an amount above 0.')
  expect(amount('Milk').getAttribute('aria-invalid')).toBe('true')
  expect(describing(amount('Oats'))).toBe('')
  expect(document.activeElement).toBe(amount('Milk'))
  expect(calls).not.toContain('PUT /api/recipes/9')
  await user.type(amount('Milk'), '2')
  expect(describing(amount('Milk'))).toBe('')
})

test("the server's section, amount and unit refusals show on their fields; an unknown ingredient on the page", async () => {
  const withOz = recipe({
    ...layered,
    sections: [layered.sections[0]!, { name: 'Topping', items: [{ ingredient_id: 3, amount: '2', unit: 'oz', original_text: '' }] }],
  })
  const { user } = await edit({
    'GET /api/recipes/9': { body: withOz },
    'GET /api/units': 500,
    'PUT /api/recipes/9': {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'sections', 1, 'name'], type: 'name_required', msg: 'name' },
          { loc: ['body', 'sections', 0, 'items', 0, 'amount'], type: 'decimal_max_digits', msg: 'long' },
          { loc: ['body', 'sections', 1, 'items', 0, 'unit'], type: 'unit_not_convertible', msg: 'x' },
        ],
      },
    },
  })
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(describing(amount('Oats'))).toBe('Use at most 9 digits before the point and 6 after.'))
  expect(describing(region().getByRole('textbox', { name: 'Name of section 2' }))).toBe('Name every section.')
  expect(describing(unit('Almonds'))).toBe("oz of Almonds doesn't convert. Pick another unit or add a conversion.")

  fakeServer({
    ...catalogue,
    'PUT /api/recipes/9': {
      status: 422,
      body: { detail: [{ loc: ['body', 'sections', 0, 'items', 0, 'ingredient_id'], type: 'unknown_ingredient', msg: 'x' }] },
    },
  })
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByText('An ingredient of this recipe no longer exists. Remove it and save again.')).getAttribute('role')).toBe(
    'alert',
  )
})

test('a line whose ingredient is gone says so and can be removed', async () => {
  const gone = recipe({ id: 9, name: 'Porridge', sections: [{ name: '', items: [{ ingredient_id: 99, amount: '5', unit: '', original_text: '5 g saffron' }] }] })
  const { user } = await edit({ 'GET /api/recipes/9': { body: gone } })
  expect(rows()).toEqual([['5 g saffron', '5']])
  expect(screen.getByText('It no longer exists, so it is left out of the totals.')).toBeDefined()
  await user.click(screen.getByRole('button', { name: 'Remove 5 g saffron' }))
  expect(rows()).toEqual([])
})

test('with the unit catalogue not loaded, own-unit and stored lines still save, the server deciding', async () => {
  const inKg = recipe({ id: 9, name: 'Porridge', sections: withUnits([{ ingredient_id: 1, amount: '1', unit: 'kg' }]) })
  const put = recorder(200, () => inKg)
  const { user } = await edit({ 'GET /api/units': 500, 'GET /api/recipes/9': { body: inKg }, 'PUT /api/recipes/9': put.handler })
  expect(describing(unit('Oats'))).toBe('')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(put.sent).toHaveLength(1))
})

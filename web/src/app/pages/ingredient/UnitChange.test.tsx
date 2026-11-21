import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, ingredient, ingredientSource, unitChange, unitChangeRefusal } from '../../../test-data'
import { unitChangeQuestion } from '../../stores/unitChangeQuestion'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The unit-change question on the ingredient page (ticket 37, story 158): a
// port of the Vue UnitChangeDialog tests and the unit-change tests of the
// Vue IngredientPage.

afterEach(() => {
  vi.unstubAllGlobals()
})

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal', ingredient_count: 1 })
const oats = ingredient({ id: 7, name: 'Oats', values: [{ attribute_id: 1, value: '389' }] })
const basisChange = unitChange({ factor: '0.001', counts: { basis: 1, recipe_amounts: 4 } })

/** Opens Oats, recording the previews and the saves. */
async function openOats(server: FakeServer = {}) {
  const previews: unknown[] = []
  const sent: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/counts': { body: { recipes: 1, ingredients: 1, attributes: 1, tags: 0 } },
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy] },
    'GET /api/tags': { body: [] },
    'GET /api/ingredients/7': { body: oats },
    'GET /api/ingredients': { body: [oats] },
    'POST /api/ingredients/7/unit-change': (body) => {
      previews.push(body)
      return { body: basisChange }
    },
    'PUT /api/ingredients/7': (body) => {
      sent.push(body)
      return { body: { ...oats, ...(body as object) } }
    },
    ...server,
  })
  const app = await mountApp('/ingredients/7')
  await screen.findByRole('textbox', { name: 'Name' }, { timeout: 3000 })
  await waitFor(() => expect(calls).toContain('GET /api/units'))
  return { ...app, calls, previews, sent }
}

type Page = Awaited<ReturnType<typeof openOats>>

function where(router: Page['router']) {
  return router.state.location.pathname
}

function unitBox() {
  return screen.getByRole<HTMLInputElement>('combobox', { name: 'Measured in' })
}

function basisBox() {
  return screen.getByRole<HTMLInputElement>('textbox', { name: 'Value basis' })
}

function unitError() {
  return (unitBox().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

async function chooseUnit(page: Page, option: string) {
  await page.user.click(unitBox())
  await page.user.click(await screen.findByRole('option', { name: option }))
}

async function typeUnit(page: Page, unit: string) {
  await page.user.clear(unitBox())
  await page.user.type(unitBox(), unit)
  await page.user.keyboard('{Escape}') // closes the unit list
}

function save(page: Page) {
  return page.user.click(screen.getByRole('button', { name: 'Save' }))
}

function question(name?: string) {
  return screen.findByRole('alertdialog', name ? { name } : undefined)
}

function answer(page: Page, sheet: HTMLElement, button: string) {
  return page.user.click(within(sheet).getByRole('button', { name: button }))
}

/** Asks with this preview (g to kg) and gives the sheet's text. */
async function askedWith(change: ReturnType<typeof unitChange>) {
  const page = await openOats({ 'POST /api/ingredients/7/unit-change': { body: change } })
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  return (await question()).textContent ?? ''
}

test('a unit change asks first, and Convert saves the basis as typed and returns to the list', async () => {
  const page = await openOats()
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  const sheet = await question("Convert Oats’s numbers?")
  expect(page.previews).toEqual([{ unit: 'kg', basis: '100' }])
  expect(page.sent).toEqual([])
  expect(sheet.textContent).toContain('Oats: the basis and 4 recipe amounts will be converted from g to kg (× 0.001).')
  await answer(page, sheet, 'Convert')
  await waitFor(() => expect(where(page.router)).toBe('/ingredients'))
  expect(page.sent).toEqual([expect.objectContaining({ unit: 'kg', basis: '100' })])
})

test('Cancel sends nothing and keeps the form with the typed unit', async () => {
  const page = await openOats()
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  await answer(page, await question(), 'Cancel')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(page.sent).toEqual([])
  expect(unitBox().value).toBe('kg')
  expect(unitBox().getAttribute('aria-invalid')).toBeNull()
  expect(where(page.router)).toBe('/ingredients/7')
})

test('a basis edited by hand is sent as typed in the preview and the save', async () => {
  const page = await openOats()
  await page.user.clear(basisBox())
  await page.user.type(basisBox(), '50')
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  await answer(page, await question(), 'Convert')
  await waitFor(() => expect(page.sent).toEqual([expect.objectContaining({ unit: 'kg', basis: '50' })]))
  expect(page.previews).toEqual([{ unit: 'kg', basis: '50' }])
})

test('pieces keep the numbers after a question that says so, with the basis of 1', async () => {
  const page = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'no_convert', factor: null, counts: { basis: 1, recipe_amounts: 4 } }) },
  })
  await chooseUnit(page, 'st (piece)')
  expect(basisBox().value).toBe('1')
  await save(page)
  const sheet = await question('Change unit?')
  expect(sheet.textContent).toContain('Values are not converted. Oats: the basis and 4 recipe amounts keep their numbers.')
  await answer(page, sheet, 'Change unit')
  await waitFor(() => expect(page.sent).toEqual([expect.objectContaining({ unit: 'st', basis: '1' })]))
})

test('the question names each count, singular for one and left out for none, and says what is rounded', async () => {
  expect(await askedWith(unitChange({ factor: '1000', counts: { basis: 1, recipe_amounts: 1, conversions: 2 } }))).toContain(
    'Oats: the basis, 1 recipe amount and 2 conversions will be converted from g to kg (× 1000).',
  )
})

test('a count of none is left out', async () => {
  const text = await askedWith(unitChange({ factor: '0.001', counts: { basis: 1, recipe_amounts: 0 } }))
  expect(text).toContain('Oats: the basis will be converted from g to kg (× 0.001).')
  expect(text).not.toContain('recipe amount')
})

test('values that will be rounded are said', async () => {
  expect(await askedWith(unitChange({ ...basisChange, rounded: 2 }))).toContain('2 values will be rounded.')
})

test('a count without text of its own still shows, by its key', async () => {
  const text = await askedWith(unitChange({ counts: { basis: 1, recipe_lines: 5 } }))
  expect(text).toContain('Oats: the basis and 5 recipe_lines will be converted')
  expect(text).not.toContain('unitChange')
})

test('with nothing stored in the unit the question still asks', async () => {
  expect(await askedWith(unitChange({ counts: { recipe_amounts: 0 } }))).toContain('Nothing stored in g needs converting.')
})

test('with nothing stored and nothing converted only the unit changes', async () => {
  expect(await askedWith(unitChange({ kind: 'no_convert', factor: null, counts: {} }))).toContain(
    'Nothing is stored in g; only the unit changes.',
  )
})

test('another spelling of the same unit saves with no question', async () => {
  const page = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'same', factor: null }) },
  })
  await typeUnit(page, 'gram')
  await save(page)
  await waitFor(() => expect(page.sent).toEqual([expect.objectContaining({ unit: 'gram', basis: '100' })]))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test.each([
  [
    unitChangeRefusal({ type: 'conversion_rounds_to_zero', kind: 'recipe_amount', name: 'Porridge', field: 'amount', number: '0.0004', converted: '0' }),
    'kg',
    'The amount in Porridge (0.0004 g) would round to 0 in kg. Use a smaller unit.',
  ],
  [
    unitChangeRefusal({ type: 'conversion_needs_decimals', kind: 'basis', name: 'Oats', field: 'basis', number: '0.5', decimals_needed: null }),
    'kg',
    "The basis of Oats (0.5 g) can’t be written exactly in kg.",
  ],
  [
    unitChangeRefusal({ type: 'conversion_too_large', kind: 'recipe_amount', name: 'Porridge', field: 'amount', number: '5', converted: '5000000' }),
    'mg',
    'The amount in Porridge (5 g) would be 5000000 mg, which is too large.',
  ],
  [unitChangeRefusal({ type: 'unit_not_for_ingredient' }), 'kcal', 'An ingredient is measured in an amount of food, such as g, dl or pieces.'],
  [
    unitChangeRefusal({ type: 'unit_has_dependents', name: 'Oats', conversions: 2, lines: 3 }),
    'dl',
    "Oats has 2 conversions and 3 recipe lines in other units, so its unit can’t change from g to dl. Delete or change them first.",
  ],
  [
    unitChangeRefusal({ type: 'conversion_for_new_unit', name: 'Oats', unit: 'dl' }),
    'dl',
    'Oats has a conversion for dl. Delete the conversion for dl first.',
  ],
])('the refusal %# shows under Measured in with no question and no save, until the unit is edited', async (refusal, unit, text) => {
  const page = await openOats({ 'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'no_convert', factor: null, refusal }) } })
  await typeUnit(page, unit)
  await save(page)
  await waitFor(() => expect(unitError()).toContain(text))
  expect(unitBox().getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(unitBox())
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(page.sent).toEqual([])
  expect(where(page.router)).toBe('/ingredients/7')
  expect(document.body.textContent).not.toContain('Could not save')

  await page.user.type(unitBox(), 'x')
  expect(unitError()).not.toContain(text)
})

test('a linked ingredient: a unit that is not mass is refused by the preview, g to kg still asks', async () => {
  const linked = { ...oats, source: ingredientSource() }
  const notMass =
    "An ingredient from a data source can only be measured in a mass unit such as g or kg, as the source’s values are per 100 g of food."
  const page = await openOats({
    'GET /api/ingredients/7': { body: linked },
    'POST /api/ingredients/7/unit-change': (body) => ({
      body: (body as { unit: string }).unit === 'dl'
        ? unitChange({ kind: 'no_convert', factor: null, refusal: unitChangeRefusal({ type: 'unit_not_for_source' }) })
        : basisChange,
    }),
  })
  await typeUnit(page, 'dl')
  await save(page)
  await waitFor(() => expect(unitError()).toContain(notMass))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  await question("Convert Oats’s numbers?")
})

test('a save refused after the question shows the form text, or the server sentence, under the unit', async () => {
  const page = await openOats({
    'POST /api/ingredients/7/unit-change': { body: unitChange({ kind: 'no_convert', factor: null }) },
    'PUT /api/ingredients/7': { status: 422, body: { detail: [{ loc: ['body', 'unit'], type: 'unit_not_for_ingredient', msg: 'x' }] } },
  })
  await typeUnit(page, 'kcal')
  await save(page)
  await answer(page, await question(), 'Change unit')
  await waitFor(() => expect(unitError()).toContain('An ingredient is measured in an amount of food, such as g, dl or pieces.'))
  page.unmount()

  const second = await openOats({
    'PUT /api/ingredients/7': { status: 422, body: { detail: [{ loc: ['body', 'unit'], type: 'conversion_too_large', msg: 'Oats, basis: too large' }] } },
  })
  await chooseUnit(second, 'kg (kilogram)')
  await save(second)
  await answer(second, await question(), 'Convert')
  await waitFor(() => expect(unitError()).toContain('Oats, basis: too large'))
})

test('a preview that fails saves nothing and says so', async () => {
  const page = await openOats({ 'POST /api/ingredients/7/unit-change': 500 })
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  expect((await screen.findByText('Could not save. Try again.')).getAttribute('role')).toBe('alert')
  expect(page.sent).toEqual([])
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('a new ingredient and an unchanged unit never ask', async () => {
  const page = await openOats()
  await page.user.type(screen.getByRole('textbox', { name: 'Name' }), ' (rolled)')
  await save(page)
  await waitFor(() => expect(page.sent).toHaveLength(1))
  page.unmount()

  const fresh = await openOats({ 'POST /api/ingredients': { status: 201, body: { ...oats, id: 8, name: 'Egg' } } })
  await fresh.router.navigate('/ingredients/new')
  await screen.findByRole('heading', { name: 'New ingredient' })
  await fresh.user.type(screen.getByRole('textbox', { name: 'Name' }), 'Egg')
  await typeUnit(fresh, 'st')
  await save(fresh)
  await waitFor(() => expect(fresh.calls).toContain('POST /api/ingredients'))
  expect([...page.calls, ...fresh.calls].filter((call) => call.includes('unit-change'))).toEqual([])
})

test('leaving the page with the question open answers no and saves nothing', async () => {
  const page = await openOats()
  await chooseUnit(page, 'kg (kilogram)')
  await save(page)
  await question()
  await page.router.navigate('/ingredients')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(unitChangeQuestion.getSnapshot()).toBeNull()
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(page.sent).toEqual([])
})

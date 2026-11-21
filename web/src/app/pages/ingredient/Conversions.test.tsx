import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Conversion } from '../../../api/types'
import { conversion, ingredient } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The ingredient's conversions and the conversion sheet (stories 159, 160),
// ported from the Vue ConversionsCard and ConversionDialog tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

const dl = conversion({ id: 1, unit: 'dl', factor: '100' })
const pinch = conversion({ id: 2, unit: 'pinch', factor: '0.3' })
const FACTOR = 'How many g one makes'

async function openPage(conversions: Conversion[], server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/counts': { body: { recipes: 0, ingredients: 1, attributes: 0, tags: 0 } },
    ...unitRoutes(),
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/ingredients/3': { body: ingredient({ id: 3, name: 'Oats', unit: 'g', conversions }) },
    'GET /api/ingredients': { body: [] },
    ...server,
  })
  const app = await mountApp('/ingredients/3')
  await screen.findByRole('heading', { name: 'Conversions' }, { timeout: 3000 })
  await waitFor(() => expect(calls).toContain('GET /api/units'))
  return { ...app, calls }
}

type Page = Awaited<ReturnType<typeof openPage>>

/** The conversions' rows, as read. */
function rows() {
  return [...document.querySelectorAll<HTMLElement>('.conv-row')]
}

const rowTexts = () => rows().map((row) => row.querySelector('.conv-text')?.textContent)

async function openSheet(page: Page, button: string, title: string) {
  await page.user.click(screen.getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: title })
}

function unitBox(sheet: HTMLElement) {
  return within(sheet).getByRole<HTMLInputElement>('combobox', { name: 'Unit' })
}

function factorBox(sheet: HTMLElement) {
  return within(sheet).getByRole<HTMLInputElement>('textbox', { name: FACTOR })
}

async function fill(page: Page, box: HTMLInputElement, text: string) {
  await page.user.clear(box)
  if (text) await page.user.type(box, text)
}

/** The text that describes a box (its hint and error). */
function describing(box: HTMLElement) {
  return (box.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

const saves = (calls: string[]) => calls.filter((call) => /^(POST|PUT) /.test(call))

test('a conversion reads "1 dl = 100 g"', async () => {
  await openPage([dl, pinch])
  expect(rowTexts()).toEqual(['1 dl = 100 g', '1 pinch = 0.3 g'])
})

test('an AI conversion says it is suggested by AI and a user one does not', async () => {
  await openPage([conversion({ id: 1, unit: 'dl', factor: '100', source: 'ai' }), pinch])
  expect(rows()[0]!.textContent).toContain('Suggested by AI, not checked by you')
  expect(rows()[1]!.textContent).not.toContain('Suggested by AI')
})

test('an empty list says so', async () => {
  await openPage([])
  expect(screen.getByText('No conversions yet.')).toBeDefined()
  expect(rows()).toHaveLength(0)
})

test('Add opens the sheet, and the saved conversion joins the list', async () => {
  const sent: unknown[] = []
  const made = conversion({ id: 9, unit: 'pinch', factor: '0.3' })
  const page = await openPage([dl], {
    'POST /api/ingredients/3/conversions': (body) => {
      sent.push(body)
      return { status: 201, body: made }
    },
  })
  const sheet = await openSheet(page, '+ Add conversion', 'New unit')
  await waitFor(() => expect(document.activeElement).toBe(unitBox(sheet)))
  await fill(page, unitBox(sheet), 'pinch')
  await fill(page, factorBox(sheet), '0.3')
  expect(within(sheet).getByText('1 pinch of Oats makes 0.3 g.')).toBeDefined()
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(sent).toEqual([{ unit: 'pinch', factor: '0.3' }])
  await waitFor(() => expect(rowTexts()).toEqual(['1 dl = 100 g', '1 pinch = 0.3 g']))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New unit' })).toBeNull())
  // saving a conversion does not save the ingredient around it
  expect(saves(page.calls)).toEqual(['POST /api/ingredients/3/conversions'])
})

test('Edit starts with the conversion, puts to it and updates the list', async () => {
  const sent: unknown[] = []
  const page = await openPage([dl, pinch], {
    'PUT /api/ingredients/3/conversions/1': (body) => {
      sent.push(body)
      return { body: { ...dl, factor: '110', source: 'user' } }
    },
  })
  const sheet = await openSheet(page, 'Edit the conversion for dl', 'Edit conversion')
  expect([unitBox(sheet).value, factorBox(sheet).value]).toEqual(['dl', '100'])
  await waitFor(() => expect(document.activeElement).toBe(factorBox(sheet)))
  await fill(page, factorBox(sheet), '110')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(sent).toEqual([{ unit: 'dl', factor: '110' }])
  await waitFor(() => expect(rowTexts()).toEqual(['1 dl = 110 g', '1 pinch = 0.3 g']))
})

test('the factor names the ingredient\'s own unit', async () => {
  const page = await openPage([])
  const sheet = await openSheet(page, '+ Add conversion', 'New unit')
  expect(factorBox(sheet)).toBeDefined()
  expect(within(sheet).getByText('g', { selector: '.conv-own' })).toBeDefined()
})

test('Delete asks, calls DELETE and the row goes (and the ingredient\'s delete question no longer lists it)', async () => {
  const page = await openPage([dl, pinch], { 'DELETE /api/ingredients/3/conversions/1': 204 })
  await page.user.click(screen.getByRole('button', { name: 'Delete the conversion for dl' }))
  const question = await screen.findByRole('alertdialog', { name: 'Delete the conversion for dl?' })
  expect(question.textContent).toContain('Nothing else uses it.')
  await page.user.click(within(question).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(rowTexts()).toEqual(['1 pinch = 0.3 g']))
  expect(page.calls).toContain('DELETE /api/ingredients/3/conversions/1')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  // its row is gone, so focus goes on to Add
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Add conversion' })))

  await page.user.click(screen.getByRole('button', { name: 'Delete' }))
  const ingredientQuestion = await screen.findByRole('alertdialog', { name: 'Delete Oats?' })
  expect(ingredientQuestion.textContent).toContain('1 pinch = 0.3 g')
  expect(ingredientQuestion.textContent).not.toContain('1 dl = 100 g')
})

test('Delete is disabled while a recipe uses the conversion, which says where', async () => {
  await openPage([conversion({ id: 1, unit: 'dl', factor: '100', recipe_count: 2 })])
  const remove = screen.getByRole<HTMLButtonElement>('button', { name: 'Delete the conversion for dl' })
  expect(remove.disabled).toBe(true)
  expect(describing(remove)).toBe('Used in 2 recipes')
})

test('one recipe reads "Used in 1 recipe"', async () => {
  await openPage([conversion({ id: 1, unit: 'dl', factor: '100', recipe_count: 1 })])
  expect(rows()[0]!.textContent).toContain('Used in 1 recipe')
  expect(rows()[0]!.textContent).not.toContain('recipes')
})

test('a 409 on delete shows why and keeps the row', async () => {
  const page = await openPage([dl], {
    'DELETE /api/ingredients/3/conversions/1': { status: 409, body: { detail: 'Recipes use this conversion' } },
  })
  await page.user.click(screen.getByRole('button', { name: 'Delete the conversion for dl' }))
  await page.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect((await screen.findByRole('alert')).textContent).toBe("Can't be deleted while a recipe uses it.")
  expect(rowTexts()).toEqual(['1 dl = 100 g'])
})

test('a failed delete says so', async () => {
  const page = await openPage([dl], { 'DELETE /api/ingredients/3/conversions/1': 500 })
  await page.user.click(screen.getByRole('button', { name: 'Delete the conversion for dl' }))
  await page.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Could not delete the conversion.')
})

test('an empty unit and a number not above 0 are marked on their fields and nothing is sent', async () => {
  const page = await openPage([])
  const sheet = await openSheet(page, '+ Add conversion', 'New unit')
  await fill(page, factorBox(sheet), '0')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(describing(unitBox(sheet))).toContain('Enter a unit.')
  expect(describing(factorBox(sheet))).toContain('Enter a number above 0.')
  expect(document.activeElement).toBe(unitBox(sheet))
  await fill(page, unitBox(sheet), 'dl')
  await fill(page, factorBox(sheet), 'abc')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(describing(factorBox(sheet))).toContain('Enter a number above 0.')
  expect(saves(page.calls)).toEqual([])
})

test.each([
  ['unit_is_own_unit', 'unit', "That is the ingredient's own unit."],
  ['duplicate', 'unit', 'This ingredient has a conversion for that unit already.'],
  ['unit_not_for_ingredient', 'unit', 'An ingredient is measured in an amount of food'],
  ['decimal_max_places', 'factor', 'Use at most 9 digits before the point and 6 after.'],
])('the server refusing %s shows on the %s field and keeps the sheet open', async (type, field, message) => {
  const page = await openPage([], {
    'POST /api/ingredients/3/conversions': { status: 422, body: { detail: [{ loc: ['body', field], type, msg: 'x' }] } },
  })
  const sheet = await openSheet(page, '+ Add conversion', 'New unit')
  await fill(page, unitBox(sheet), 'dl')
  await fill(page, factorBox(sheet), '40')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  const box = field === 'unit' ? unitBox(sheet) : factorBox(sheet)
  await waitFor(() => expect(describing(box)).toContain(message))
  expect(box.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByRole('dialog', { name: 'New unit' })).toBe(sheet)
})

test('a conversion that recipes use keeps its unit: only the number can change', async () => {
  const used = conversion({ id: 5, unit: 'dl', factor: '40', recipe_count: 2 })
  const page = await openPage([used], {
    'PUT /api/ingredients/3/conversions/5': { body: { ...used, factor: '45' } },
  })
  const sheet = await openSheet(page, 'Edit the conversion for dl', 'Edit conversion')
  expect(unitBox(sheet).disabled).toBe(true)
  expect(describing(unitBox(sheet))).toContain('A recipe uses this unit, so only the number can change.')
  await fill(page, factorBox(sheet), '45')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(rowTexts()).toEqual(['1 dl = 45 g']))
})

test('a unit change refused because a recipe now uses the unit says so on the unit', async () => {
  const page = await openPage([conversion({ id: 5, unit: 'dl', factor: '40' })], {
    'PUT /api/ingredients/3/conversions/5': {
      status: 409,
      body: { detail: [{ loc: ['body', 'unit'], type: 'conversion_in_use', msg: 'x' }] },
    },
  })
  const sheet = await openSheet(page, 'Edit the conversion for dl', 'Edit conversion')
  await fill(page, unitBox(sheet), 'msk')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(describing(unitBox(sheet))).toContain('A recipe uses this unit, so only the number can change.'))
})

test('a failed save says so', async () => {
  const page = await openPage([], { 'POST /api/ingredients/3/conversions': 500 })
  const sheet = await openSheet(page, '+ Add conversion', 'New unit')
  await fill(page, unitBox(sheet), 'dl')
  await fill(page, factorBox(sheet), '40')
  await page.user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect((await within(sheet).findByRole('alert')).textContent).toBe('Could not save the conversion.')
})

test('Cancel sends nothing, and the sheet opens afresh', async () => {
  const page = await openPage([])
  let sheet = await openSheet(page, '+ Add conversion', 'New unit')
  await fill(page, unitBox(sheet), 'dl')
  await fill(page, factorBox(sheet), '40')
  await page.user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New unit' })).toBeNull())
  expect(saves(page.calls)).toEqual([])
  sheet = await openSheet(page, '+ Add conversion', 'New unit')
  expect([unitBox(sheet).value, factorBox(sheet).value]).toEqual(['', ''])
})

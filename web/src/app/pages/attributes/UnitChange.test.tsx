import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, unitChange, unitChangeRefusal } from '../../../test-data'
import { unitChangeQuestion } from '../../stores/unitChangeQuestion'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The unit-change question on the Attributes page (ticket 37, story 171): a
// port of the unit-change tests of the Vue AttributesPage.

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 })

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mounts the page with Energy's entry open, recording the previews and saves. */
async function openEnergy(server: FakeServer = {}) {
  const previews: unknown[] = []
  const sent: unknown[] = []
  const calls = fakeServer({
    'GET /api/session': 204,
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy, protein] },
    'POST /api/attributes/1/unit-change': (body) => {
      previews.push(body)
      return { body: unitChange() }
    },
    'PUT /api/attributes/1': (body) => {
      sent.push(body)
      return { body: { ...energy, ...(body as object) } }
    },
    ...server,
  })
  const app = await mountApp('/attributes')
  await screen.findByRole('list')
  await app.user.click(entry('Energy'))
  return { ...app, calls, previews, sent }
}

type Page = Awaited<ReturnType<typeof openEnergy>>

function entry(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}\\b`) })
}

function openForm() {
  return screen.getByRole('form')
}

function unitBox() {
  return within(openForm()).getByRole('combobox', { name: 'Unit' }) as HTMLInputElement
}

function decimalsBox() {
  return within(openForm()).getByRole('textbox', { name: 'Decimals' }) as HTMLInputElement
}

/** The error under the unit (with its hint). */
function unitError() {
  return (unitBox().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ')
}

async function typeUnit(page: Page, unit: string) {
  await page.user.clear(unitBox())
  await page.user.type(unitBox(), unit)
}

function done(page: Page) {
  return page.user.click(within(openForm()).getByRole('button', { name: 'Done' }))
}

function question(name?: string) {
  return screen.findByRole('alertdialog', name ? { name } : undefined)
}

function answer(page: Page, sheet: HTMLElement, button: string) {
  return page.user.click(within(sheet).getByRole('button', { name: button }))
}

async function noQuestion() {
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
}

test('a unit change asks first, saying what is converted, and Convert saves it', async () => {
  const page = await openEnergy()
  await typeUnit(page, 'kJ')
  await done(page)
  const sheet = await question("Convert Energy’s numbers?")
  expect(page.previews).toEqual([{ unit: 'kJ', decimals: 0 }])
  expect(page.sent).toEqual([])
  expect(sheet.textContent).toContain('Energy: 12 ingredient values and 2 goals will be converted from kcal to kJ (× 1000).')
  expect(sheet.textContent).not.toContain('rounded')
  expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Cancel' }))

  await answer(page, sheet, 'Convert')
  await waitFor(() => expect(page.sent).toEqual([{ name: 'Energy', unit: 'kJ', decimals: 0 }]))
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  expect(entry('Energy').textContent).toContain('kJ')
  await noQuestion()
})

test('Cancel saves nothing and keeps the entry open with the typed unit', async () => {
  const page = await openEnergy()
  await typeUnit(page, 'kJ')
  await done(page)
  await answer(page, await question(), 'Cancel')
  await noQuestion()
  expect(page.sent).toEqual([])
  expect(unitBox().value).toBe('kJ')
  expect(unitBox().getAttribute('aria-invalid')).toBeNull()
  expect(document.body.textContent).not.toContain('Could not save')
})

test('Escape cancels too', async () => {
  const page = await openEnergy()
  await typeUnit(page, 'kJ')
  await done(page)
  await question()
  await page.user.keyboard('{Escape}')
  await noQuestion()
  expect(page.sent).toEqual([])
  expect(unitBox().value).toBe('kJ')
})

test('another kind of unit says the numbers keep their value, and Change unit saves', async () => {
  const page = await openEnergy({
    'POST /api/attributes/1/unit-change': { body: unitChange({ kind: 'no_convert', factor: null }) },
  })
  await typeUnit(page, 'IU')
  await done(page)
  const sheet = await question('Change unit?')
  expect(sheet.textContent).toContain('Values are not converted. Energy: 12 ingredient values and 2 goals keep their numbers.')
  await answer(page, sheet, 'Change unit')
  await waitFor(() => expect(page.sent).toEqual([{ name: 'Energy', unit: 'IU', decimals: 0 }]))
})

test('opening another entry asks first, then saves and opens it', async () => {
  const page = await openEnergy()
  await typeUnit(page, 'kJ')
  await page.user.click(entry('Protein'))
  await answer(page, await question(), 'Convert')
  await waitFor(() => expect(openForm().getAttribute('aria-label')).toBe('Editing Protein'))
  expect(page.sent).toEqual([{ name: 'Energy', unit: 'kJ', decimals: 0 }])
})

test('another spelling of the same unit saves with no question', async () => {
  const page = await openEnergy({
    'POST /api/attributes/1/unit-change': { body: unitChange({ kind: 'same', factor: null }) },
  })
  await typeUnit(page, 'Kcal')
  await done(page)
  await waitFor(() => expect(page.sent).toEqual([{ name: 'Energy', unit: 'Kcal', decimals: 0 }]))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('a refusal shows under the unit with no question, and asking again uses the raised decimals', async () => {
  const previews: unknown[] = []
  const refusal = unitChangeRefusal({
    type: 'conversion_needs_decimals', kind: 'goal', name: 'Energy per day', field: 'min',
    number: '0.5', converted: '0.0005', decimals_needed: 4,
  })
  const page = await openEnergy({
    'POST /api/attributes/1/unit-change': (body) => {
      previews.push(body)
      return { body: unitChange({ refusal: (body as { decimals: number }).decimals < 4 ? refusal : null }) }
    },
  })
  await typeUnit(page, 'kJ')
  await done(page)
  const text = "The goal Energy per day’s minimum (0.5 kcal) would need 4 decimals as kJ. Raise Energy’s decimals first."
  await waitFor(() => expect(unitError()).toContain(text))
  expect(unitBox().getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(unitBox())
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(page.sent).toEqual([])
  expect(unitBox().value).toBe('kJ')

  // the refusal stays while another field is edited
  await page.user.clear(decimalsBox())
  await page.user.type(decimalsBox(), '4')
  expect(unitError()).toContain(text)
  await done(page)
  await answer(page, await question(), 'Convert')
  expect(previews).toEqual([{ unit: 'kJ', decimals: 0 }, { unit: 'kJ', decimals: 4 }])
  await waitFor(() => expect(page.sent).toEqual([{ name: 'Energy', unit: 'kJ', decimals: 4 }]))
})

test.each([
  [
    unitChangeRefusal({ type: 'unit_mismatch', kind: 'source_column', name: 'TEST Protein', source: 'TEST Source', unit: 'g' }),
    'g',
    "Energy is mapped from TEST Protein (TEST Source), which is in g, so it can’t become g. Unmap the column on the data source page first.",
  ],
  [
    unitChangeRefusal({ type: 'conversion_too_large', kind: 'goal', name: 'Energy per day', field: 'max', number: '1', converted: '9' }),
    'kJ',
    "The goal Energy per day’s maximum (1 kcal) would be 9 kJ, which is too large.",
  ],
  [
    unitChangeRefusal({ type: 'conversion_rounds_to_zero', kind: 'ingredient_value', name: 'Salt', number: '0.4' }),
    'Mcal',
    'The Energy value of Salt (0.4 kcal) would round to 0 in Mcal. Use a smaller unit.',
  ],
])('the refusal %# shows under the unit until the unit is edited', async (refusal, unit, text) => {
  const page = await openEnergy({ 'POST /api/attributes/1/unit-change': { body: unitChange({ refusal }) } })
  await typeUnit(page, unit)
  await done(page)
  await waitFor(() => expect(unitError()).toContain(text))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(page.sent).toEqual([])
  await page.user.type(unitBox(), 'x')
  expect(unitError()).not.toContain(text)
  expect(unitBox().getAttribute('aria-invalid')).toBeNull()
})

test('a preview that fails saves nothing and says so', async () => {
  const page = await openEnergy({ 'POST /api/attributes/1/unit-change': 500 })
  await typeUnit(page, 'kJ')
  await done(page)
  await screen.findByText('Could not save. Try again.')
  expect(page.sent).toEqual([])
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test("a save refused after the question shows the server’s sentence under the unit", async () => {
  const page = await openEnergy({
    'PUT /api/attributes/1': {
      status: 422,
      body: { detail: [{ loc: ['body', 'unit'], type: 'conversion_needs_decimals', msg: 'Energy per day, min: 0.5 would need 4 decimals' }] },
    },
  })
  await typeUnit(page, 'kJ')
  await done(page)
  await answer(page, await question(), 'Convert')
  await waitFor(() => expect(unitError()).toContain('Energy per day, min: 0.5 would need 4 decimals'))
  expect(unitBox().value).toBe('kJ')
})

test('a new attribute and an unchanged unit never ask', async () => {
  const page = await openEnergy({
    'POST /api/attributes': (body) => ({ status: 201, body: { ...(body as object), id: 3, ingredient_count: 0, goal_count: 0, mapping_count: 0 } }),
  })
  await page.user.type(within(openForm()).getByRole('textbox', { name: 'Name' }), ' total')
  await done(page)
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  await page.user.click(screen.getByRole('button', { name: '+ New attribute' }))
  await page.user.type(within(openForm()).getByRole('textbox', { name: 'Name' }), 'Score')
  await page.user.type(unitBox(), 'pts')
  await done(page)
  await waitFor(() => expect(page.calls).toContain('POST /api/attributes'))
  expect(page.calls.filter((call) => call.includes('unit-change'))).toEqual([])
})

test('leaving the page with the question open answers no and saves nothing', async () => {
  const page = await openEnergy()
  await typeUnit(page, 'kJ')
  await done(page)
  await question()
  await page.router.navigate('/ingredients')
  await noQuestion()
  expect(unitChangeQuestion.getSnapshot()).toBeNull()
  // the save that waited on the answer does not go on
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(page.sent).toEqual([])
})

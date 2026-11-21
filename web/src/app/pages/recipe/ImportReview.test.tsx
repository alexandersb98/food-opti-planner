import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ImportedLine, ImportedRecipe, Ingredient } from '../../../api/types'
import { attribute, importedLine, importedRecipe, ingredient, recipe } from '../../../test-data'
import { importDraftStore } from '../../stores/importDraft'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The import review (ticket 35): an imported recipe opens as a new spread in
// edit mode, under review. The parity checklist is the Vue ImportLineReview
// and NewIngredientDialog tests and the import tests of the Vue RecipePage.

vi.setConfig({ testTimeout: 15000 })

afterEach(() => {
  vi.unstubAllGlobals()
})

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const oats = ingredient({ id: 1, name: 'Oats', values: [{ attribute_id: 1, value: '389' }] })
const milk = ingredient({ id: 2, name: 'Milk', unit: 'ml' })
const almonds = ingredient({ id: 3, name: 'Almonds' })

const porridgeLine = importedLine({
  original_text: '100 g oats',
  food: 'oats',
  amount: '100',
  ingredient_id: 1,
  status: 'own_unit',
})
const milkLine = importedLine({ original_text: '3 dl milk', food: 'milk', amount: '3', unit: 'dl' })
const honeyLine = importedLine({ original_text: '2 tbsp honey', food: 'honey', amount: '2', unit: 'msk' })
const pepperLine = importedLine({
  original_text: 'salt and pepper to taste',
  food: 'salt and pepper',
  amount: null,
  status: 'not_an_ingredient',
})
const almondLine = importedLine({
  original_text: '3 dl almonds',
  food: 'almonds',
  amount: '3',
  unit: 'dl',
  ingredient_id: 3,
  status: 'needs_factor',
  suggested_factor: '50',
})

const catalogue: FakeServer = {
  'GET /api/session': 204,
  'GET /api/attributes': { body: [energy] },
  'GET /api/tags': { body: [] },
  'GET /api/ingredients': { body: [oats, milk, almonds] },
  'GET /api/recipes': { body: [] },
  'POST /api/recipes/derived-tags': { body: [] },
  ...unitRoutes(),
}

/** The import page's hand-over: the draft left in the store, then
 * /recipes/new opened, as a finished import does. */
async function openImport(
  lineList: ImportedLine[] = [porridgeLine, milkLine, honeyLine, pepperLine],
  server: FakeServer = {},
  over: Partial<ImportedRecipe> = {},
) {
  const calls = fakeServer({ ...catalogue, ...server })
  const app = await mountApp('/recipes')
  importDraftStore.put(importedRecipe({ sections: [{ name: '', lines: lineList }], ...over }))
  await act(() => app.router.navigate('/recipes/new'))
  await screen.findByRole('heading', { level: 1, name: 'New recipe' }, { timeout: 5000 })
  return { ...app, calls }
}

type User = Awaited<ReturnType<typeof openImport>>['user']

/** A request's bodies, recorded, and the reply. */
function recorder(status: number, reply: (body: object) => object) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: reply(body as object) }
  }
  return { sent, handler }
}

const stored = (body: object) => ({ ...recipe({ id: 8, name: 'Imported porridge' }), ...body, id: 8 })

const banner = () => document.querySelector('.review-banner-text')?.textContent
const region = () => within(screen.getByRole('region', { name: 'Ingredients' }))
const lineItems = () => region().getAllByRole('listitem')
const line = (index: number) => within(lineItems()[index]!)
const sources = () => [...document.querySelectorAll('.review-source')].map((p) => p.textContent)
const needing = () => document.querySelectorAll('.review-needs').length
const skippedLines = () => document.querySelectorAll('.review-skipped').length
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' })
const path = (router: Awaited<ReturnType<typeof openImport>>['router']) =>
  router.state.location.pathname
const factorBox = (index: number) => line(index).getByRole<HTMLInputElement>('textbox', { name: /^How many/ })

async function retype(user: User, box: HTMLInputElement, text: string) {
  await user.clear(box)
  if (text) await user.paste(text)
}

test('an imported recipe opens in review: the banner counts the lines that need you and each line shows its source', async () => {
  await openImport()
  expect(banner()).toBe('Imported from pasted text. 2 lines need you.')
  expect(sources()).toEqual([
    'From the text: 100 g oats',
    'From the text: 3 dl milk',
    'From the text: 2 tbsp honey',
    'From the text: salt and pepper to taste',
  ])
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe('Imported porridge')
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: /^Serves/ }).value).toBe('2')
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Instructions' }).value).toBe('Boil.\nStir.')
  expect(skippedLines()).toBe(1)
  expect(needing()).toBe(2)
  expect(document.querySelector('.review-banner')!.textContent).toContain('Match, convert or skip every line to save.')
  expect(screen.getByText('Reviewing an imported recipe')).toBeDefined()
  // the line in the ingredient's own unit is ready: no review panel
  expect(line(0).queryByRole('button', { name: /^Pick ingredient/ })).toBeNull()
})

test('an unmatched line has Pick ingredient and Skip, named for their line', async () => {
  await openImport()
  expect(line(1).getByRole('button', { name: 'Pick ingredient: milk' })).toBeDefined()
  expect(line(1).getByRole('button', { name: 'Skip: milk' })).toBeDefined()
  expect(lineItems()[1]!.textContent).toContain('None of your ingredients is matched to “milk” yet.')
})

test('Pick ingredient opens the picker searching for the food; picking matches the line and the count drops', async () => {
  const { user } = await openImport()
  await user.click(line(1).getByRole('button', { name: 'Pick ingredient: milk' }))
  const sheet = await screen.findByRole('dialog', { name: 'Match “milk”' })
  expect(within(sheet).getByRole<HTMLInputElement>('searchbox').value).toBe('milk')
  const rows = within(sheet)
    .getAllByRole('listitem')
    .map((li) => li.textContent)
  expect(rows).toEqual(['Milk ml'])
  await user.click(within(sheet).getByRole('button', { name: /^Milk/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(line(1).queryByRole('button', { name: /^Pick ingredient/ })).toBeNull()
  expect(line(1).getByRole('combobox', { name: 'Unit of Milk' })).toBeDefined()
  expect(banner()).toBe('Imported from pasted text. 1 line needs you.')
  // the focus goes to the line's amount
  await waitFor(() => expect(document.activeElement).toBe(line(1).getByRole('textbox', { name: 'Amount of Milk' })))
})

test('+ New ingredient opens the form in a sheet named after the food; saving matches the line and asks for a factor', async () => {
  const honey: Ingredient = ingredient({ id: 9, name: 'Honey', unit: 'g' })
  const asked: unknown[] = []
  const created = recorder(201, () => honey)
  const { user, router, calls } = await openImport(undefined, {
    'POST /api/ingredients': created.handler,
    'POST /api/recipe-imports/factor': (body) => {
      asked.push(body)
      return { body: { factor: '15' } }
    },
  })
  await user.click(line(2).getByRole('button', { name: 'Pick ingredient: honey' }))
  const picker = await screen.findByRole('dialog', { name: 'Match “honey”' })
  expect(within(picker).getByRole<HTMLInputElement>('searchbox').value).toBe('honey')
  expect(within(picker).getByRole('status').textContent).toBe('No ingredient is called “honey” yet. Make it here:')
  await user.click(within(picker).getByRole('button', { name: '+ New ingredient' }))
  const sheet = await screen.findByRole('dialog', { name: 'New ingredient' })
  const name = await within(sheet).findByRole<HTMLInputElement>('textbox', { name: 'Name' }, { timeout: 5000 })
  expect(name.value).toBe('Honey')
  await user.click(within(sheet).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(created.sent).toHaveLength(1)
  expect(created.sent[0]).toMatchObject({ name: 'Honey' })
  // the form's submit did not reach the recipe's form
  expect(calls).not.toContain('POST /api/recipes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(path(router)).toBe('/recipes/new')
  expect(line(2).getByRole('combobox', { name: 'Unit of Honey' })).toBeDefined()
  expect(asked).toEqual([{ ingredient_id: 9, unit: 'msk', food: 'honey' }])
  await waitFor(() => expect(factorBox(2).value).toBe('15'))
  expect(line(2).getByRole('img', { name: 'Suggested by AI, not checked by you' })).toBeDefined()
})

test('a line that needs a factor shows 1 dl = [50] g with the sparkle; Accept settles it and Change reopens it', async () => {
  const { user } = await openImport([porridgeLine, almondLine])
  expect(lineItems()[1]!.textContent).toContain('1 dl =')
  expect(lineItems()[1]!.textContent).toContain('We don’t know what 1 dl of almonds weighs')
  expect(factorBox(1).value).toBe('50')
  expect(line(1).getByRole('img', { name: 'Suggested by AI, not checked by you' })).toBeDefined()
  expect(banner()).toBe('Imported from pasted text. 1 line needs you.')

  await user.click(line(1).getByRole('button', { name: 'Accept: Almonds' }))
  expect(banner()).toBe('Imported from pasted text. All lines are ready.')
  expect(lineItems()[1]!.textContent).toContain('1 dl = 50 g')
  expect(line(1).queryByRole('textbox', { name: /^How many/ })).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(line(1).getByRole('button', { name: 'Change: Almonds' })))

  await user.click(line(1).getByRole('button', { name: 'Change: Almonds' }))
  expect(banner()).toBe('Imported from pasted text. 1 line needs you.')
  expect(factorBox(1).value).toBe('50')
})

test('typing another number drops the sparkle; an invalid one says why Accept is disabled', async () => {
  const { user } = await openImport([porridgeLine, almondLine])
  await retype(user, factorBox(1), '55')
  expect(line(1).queryByRole('img', { name: /Suggested by AI/ })).toBeNull()
  await retype(user, factorBox(1), '0')
  expect(line(1).getByRole<HTMLButtonElement>('button', { name: 'Accept: Almonds' }).disabled).toBe(true)
  expect(factorBox(1).getAttribute('aria-invalid')).toBe('true')
  expect(lineItems()[1]!.textContent).toContain('Enter a number above 0, with at most 6 decimals.')
  await retype(user, factorBox(1), '')
  expect(line(1).getByRole<HTMLButtonElement>('button', { name: 'Accept: Almonds' }).disabled).toBe(true)
})

test('a changed factor is saved as the owner’s and the same one as the AI’s, and only used conversions are sent', async () => {
  for (const [typed, source] of [
    ['50', 'ai'],
    ['55', 'user'],
  ] as const) {
    const { sent, handler } = recorder(201, stored)
    const { user, router, unmount } = await openImport([porridgeLine, almondLine], { 'POST /api/recipes': handler })
    await retype(user, factorBox(1), typed)
    await user.click(line(1).getByRole('button', { name: 'Accept: Almonds' }))
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(1))
    const body = sent[0] as { new_conversions: unknown[]; sections: { items: unknown[] }[] }
    expect(body.new_conversions).toEqual([{ ingredient_id: 3, unit: 'dl', factor: typed, source }])
    expect(body.sections[0]!.items).toEqual([
      { ingredient_id: 1, amount: '100', unit: '', original_text: '100 g oats' },
      { ingredient_id: 3, amount: '3', unit: 'dl', original_text: '3 dl almonds' },
    ])
    // a saved import opens its spread without asking
    await waitFor(() => expect(path(router)).toBe('/recipes/8'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    unmount()
  }
})

test('a conversion accepted and then left unused is not sent', async () => {
  const { sent, handler } = recorder(201, stored)
  const { user } = await openImport([porridgeLine, almondLine], { 'POST /api/recipes': handler })
  await user.click(line(1).getByRole('button', { name: 'Accept: Almonds' }))
  await user.selectOptions(line(1).getByRole('combobox', { name: 'Unit of Almonds' }), '')
  await user.click(saveButton())
  await waitFor(() => expect(sent).toHaveLength(1))
  expect((sent[0] as { new_conversions: unknown[] }).new_conversions).toEqual([])
})

test('a not-an-ingredient line is greyed; Add anyway makes it a line to match, with an empty amount', async () => {
  const { user } = await openImport([porridgeLine, pepperLine])
  expect(lineItems()[1]!.className).toContain('review-skipped')
  expect(line(1).getByRole<HTMLInputElement>('textbox', { name: /^Amount of/ }).disabled).toBe(true)
  expect(lineItems()[1]!.textContent).toContain('Not an ingredient, so left out')
  expect(banner()).toBe('Imported from pasted text. All lines are ready.')
  await user.click(line(1).getByRole('button', { name: 'Add anyway: salt and pepper' }))
  expect(lineItems()[1]!.className).not.toContain('review-skipped')
  expect(line(1).getByRole<HTMLInputElement>('textbox', { name: /^Amount of/ }).value).toBe('')
  expect(banner()).toBe('Imported from pasted text. 1 line needs you.')
  await waitFor(() =>
    expect(document.activeElement).toBe(line(1).getByRole('button', { name: 'Pick ingredient: salt and pepper' })),
  )
})

test('Skip leaves a line out of the save and Add back returns it', async () => {
  const { sent, handler } = recorder(201, stored)
  const { user } = await openImport([porridgeLine, milkLine], { 'POST /api/recipes': handler })
  await user.click(line(1).getByRole('button', { name: 'Skip: milk' }))
  expect(banner()).toBe('Imported from pasted text. All lines are ready.')
  expect(lineItems()[1]!.textContent).toContain('Skipped')
  await waitFor(() => expect(document.activeElement).toBe(line(1).getByRole('button', { name: 'Add back: milk' })))
  await user.click(line(1).getByRole('button', { name: 'Add back: milk' }))
  expect(line(1).getByRole('button', { name: 'Pick ingredient: milk' })).toBeDefined()
  await user.click(line(1).getByRole('button', { name: 'Skip: milk' }))
  await user.click(saveButton())
  await waitFor(() => expect(sent).toHaveLength(1))
  const body = sent[0] as { sections: { items: { ingredient_id: number }[] }[] }
  expect(body.sections[0]!.items.map((i) => i.ingredient_id)).toEqual([1])
})

test('a unit that cannot be used says so, with Skip; another unit from the list settles it', async () => {
  const energyLine = importedLine({
    original_text: '200 kcal oats',
    food: 'oats',
    amount: '200',
    unit: 'kcal',
    ingredient_id: 1,
    status: 'bad_unit',
  })
  const { user } = await openImport([energyLine])
  expect(lineItems()[0]!.textContent).toContain("kcal can’t be used for an ingredient. Pick another unit.")
  expect(line(0).getByRole('button', { name: 'Skip: Oats' })).toBeDefined()
  expect(banner()).toBe('Imported from pasted text. 1 line needs you.')
  await user.selectOptions(line(0).getByRole('combobox', { name: 'Unit of Oats' }), 'kg')
  expect(banner()).toBe('Imported from pasted text. All lines are ready.')
})

test('Save while lines need you says so again and sends nothing; the focus goes to the first such line', async () => {
  const { sent, handler } = recorder(201, stored)
  const { user } = await openImport(undefined, { 'POST /api/recipes': handler })
  expect(saveButton().disabled).toBe(false)
  await user.click(saveButton())
  expect((await screen.findByRole('alert')).textContent).toContain('Match, convert or skip every line to save.')
  expect(sent).toEqual([])
  expect(document.activeElement).toBe(line(1).getByRole('button', { name: 'Pick ingredient: milk' }))
})

test('the banner’s next-line button brings each line that needs you into view in turn, and cycles', async () => {
  const scrolled: Element[] = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
  try {
    const { user } = await openImport()
    const lines = [...document.querySelectorAll('.review-needs')]
    const next = screen.getByRole('button', { name: 'Show the next line that needs you' })
    await user.click(next)
    await user.click(next)
    await user.click(next)
    expect(scrolled).toEqual([lines[0], lines[1], lines[0]])
    expect(document.activeElement).toBe(line(1).getByRole('button', { name: 'Pick ingredient: milk' }))
  } finally {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
})

test('leaving an imported draft asks first; Keep editing stays; Discard leaves', async () => {
  const { user, router } = await openImport()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  const ask = await screen.findByRole('alertdialog', { name: 'Discard this recipe?' })
  expect(ask.textContent).toContain('It was imported and is not saved yet.')
  expect(path(router)).toBe('/recipes/new')
  await user.click(within(ask).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(path(router)).toBe('/recipes/new')
  expect(banner()).toBe('Imported from pasted text. 2 lines need you.')

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
  await waitFor(() => expect(path(router)).toBe('/recipes'))
})

test('leaving by any link asks too, and the browser warns before a reload', async () => {
  const { router } = await openImport()
  await act(() => router.navigate('/ingredients'))
  expect(await screen.findByRole('alertdialog', { name: 'Discard this recipe?' })).toBeDefined()
  expect(path(router)).toBe('/recipes/new')
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})

test('a recipe imported from a link names the site, with a ready variant and a singular', async () => {
  const site = { source_url: 'https://www.ica.se/recept/x' }
  const first = await openImport(undefined, {}, site)
  expect(banner()).toBe('Imported from ica.se. 2 lines need you.')
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Source' }).value).toBe('https://www.ica.se/recept/x')
  first.unmount()
  const ready = await openImport([porridgeLine], {}, site)
  expect(banner()).toBe('Imported from ica.se. All lines are ready.')
  expect(document.querySelector('.review-banner')!.textContent).not.toContain('Match, convert or skip')
  ready.unmount()
  await openImport([porridgeLine, milkLine], {}, site)
  expect(banner()).toBe('Imported from ica.se. 1 line needs you.')
})

test('a site that is not a valid link, or has markup in its path, is shown as plain text only', async () => {
  const bad = await openImport(undefined, {}, { source_url: 'https://<img src=x onerror=alert(1)>.example' })
  expect(banner()).toBe('Imported from pasted text. 2 lines need you.')
  expect(document.querySelector('.review-banner img')).toBeNull()
  bad.unmount()
  await openImport(undefined, {}, { source_url: 'https://a.example/<b>x</b>' })
  expect(banner()).toBe('Imported from a.example. 2 lines need you.')
  expect(document.querySelector('.review-banner b')).toBeNull()
})

test('saving an imported recipe sends the source link as it is', async () => {
  const { sent, handler } = recorder(201, stored)
  const { user } = await openImport(
    [porridgeLine],
    { 'POST /api/recipes': handler },
    { source_url: 'https://www.ica.se/recept/x' },
  )
  await user.click(saveButton())
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toMatchObject({ source_url: 'https://www.ica.se/recept/x' })
})

test('the cut note shows when the text was cut', async () => {
  await openImport(undefined, {}, { cut: true })
  expect(document.querySelector('.review-banner')!.textContent).toContain('The text was long: the end was left out.')
})

test('an ordinary new recipe has no banner and never asks; a reload of an import is the empty editor', async () => {
  fakeServer(catalogue)
  const { user, router } = await mountApp('/recipes/new')
  await screen.findByRole('heading', { level: 1, name: 'New recipe' }, { timeout: 5000 })
  expect(document.querySelector('.review-banner')).toBeNull()
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe('')
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Half typed')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(path(router)).toBe('/recipes'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('a server refusal of a conversion shows the save message and keeps the page', async () => {
  const refusal = {
    status: 422,
    body: { detail: [{ loc: ['body', 'new_conversions', 0, 'unit'], type: 'duplicate', msg: 'x' }] },
  }
  const { user, router } = await openImport([porridgeLine, almondLine], { 'POST /api/recipes': refusal })
  await user.click(line(1).getByRole('button', { name: 'Accept: Almonds' }))
  await user.click(saveButton())
  expect((await screen.findByRole('alert')).textContent).toBe(
    'A conversion was refused. Check the units of the lines and save again.',
  )
  expect(path(router)).toBe('/recipes/new')
})

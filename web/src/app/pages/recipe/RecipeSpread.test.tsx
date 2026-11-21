import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute, conversion, ingredient, lines, recipe, tag } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'
import { methodSteps, plateNumeral, portionText, sourceLink } from './spread'

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
const almonds = ingredient({ id: 3, name: 'Almonds', values: [{ attribute_id: 2, value: '21' }], tag_ids: [1, 3] })
const porridge = recipe({
  id: 9,
  name: 'Porridge',
  sections: lines([1, '60'], [2, '200']),
  extra_tag_ids: [2],
  derived_tag_ids: [1],
})

async function open(server: FakeServer = {}, path = '/recipes/9') {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/attributes': { body: [energy, protein] },
    'GET /api/tags': { body: [vegan, quick, nuts] },
    'GET /api/ingredients': { body: [oats, milk, almonds] },
    'GET /api/recipes/9': { body: porridge },
    ...unitRoutes(),
    ...server,
  })
  const app = await mountApp(path)
  await screen.findByRole('heading', { level: 1 })
  return { ...app, calls }
}

/** The ingredient lines of the spread, as their text. */
function ingredientLines() {
  const section = screen.getByRole('region', { name: 'Ingredients' })
  return within(section)
    .getAllByRole('listitem')
    .map((item) => item.textContent)
}

function nutrition() {
  const table = screen.getByRole('table', { name: 'Per portion' })
  return within(table)
    .getAllByRole('row')
    .map((row) => [within(row).getByRole('rowheader').textContent, within(row).getByRole('cell').textContent])
}

test('the head shows the plate, plate number, kicker, name, servings and portion range', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, servings: 4, step: '0.5' } } })
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Porridge')
  expect(screen.getByRole('img', { name: 'Colour plate for Porridge' })).toBeDefined()
  // Printed IX, read as Plate 9.
  expect(screen.getByText('Plate IX').getAttribute('aria-hidden')).toBe('true')
  expect(screen.getByText('Plate 9')).toBeDefined()
  // Filed under the first of its tags, in tag order.
  expect(screen.getByText('Recipe 9, filed under vegan')).toBeDefined()
  const terms = screen.getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling?.textContent])
  expect(terms).toEqual([
    ['Serves', '4'],
    ['Portions', '½–2in steps of ½'],
  ])
})

test('a recipe without tags has a plain kicker', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, extra_tag_ids: [], derived_tag_ids: [] } } })
  expect(screen.getByText('Recipe 9')).toBeDefined()
  expect(screen.queryByRole('heading', { name: 'Tags' })).toBeNull()
})

test('the running head shows the recipe name', async () => {
  await open()
  // the printed running head is hidden from assistive technology, so it is
  // read as text in the masthead (the page's header is a banner to jsdom too)
  const masthead = within(document.querySelector<HTMLElement>('.masthead')!)
  await waitFor(() => expect(masthead.getByText('Porridge')).toBeDefined())
  // still page 3, the recipe index's, as a detail of it
  expect(masthead.getByText('3')).toBeDefined()
})

test('the ingredients show amount, unit and name, and a single unnamed section has no heading', async () => {
  await open()
  expect(ingredientLines()).toEqual(['60 gOats', '200 mlMilk'])
  expect(within(screen.getByRole('region', { name: 'Ingredients' })).queryByRole('heading', { level: 3 })).toBeNull()
})

test('section names show when there are several sections, or the only one has a name', async () => {
  const layered = recipe({
    id: 9,
    name: 'Layered',
    sections: [
      { name: 'Base', items: [{ ingredient_id: 1, amount: '200', unit: '', original_text: '' }] },
      { name: 'Topping', items: [{ ingredient_id: 3, amount: '40', unit: '', original_text: '' }] },
    ],
  })
  await open({ 'GET /api/recipes/9': { body: layered } })
  const region = within(screen.getByRole('region', { name: 'Ingredients' }))
  expect(region.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Base', 'Topping'])
  expect(ingredientLines()).toEqual(['200 gOats', '40 gAlmonds'])
})

test('a single named section shows its name', async () => {
  const named = recipe({ id: 9, name: 'Soup', sections: [{ name: 'Broth', items: [{ ingredient_id: 2, amount: '500', unit: '', original_text: '' }] }] })
  await open({ 'GET /api/recipes/9': { body: named } })
  const region = within(screen.getByRole('region', { name: 'Ingredients' }))
  expect(region.getByRole('heading', { level: 3 }).textContent).toBe('Broth')
})

test('a line whose unit does not convert, and one whose ingredient is gone, are flagged', async () => {
  const stale = recipe({
    id: 9,
    name: 'Porridge',
    sections: [
      {
        name: '',
        items: [
          { ingredient_id: 1, amount: '1', unit: 'dl', original_text: '' },
          { ingredient_id: 1, amount: '60', unit: '', original_text: '' },
          { ingredient_id: 99, amount: '2', unit: 'st', original_text: '2 lemons' },
        ],
      },
    ],
  })
  await open({ 'GET /api/recipes/9': { body: stale } })
  await waitFor(() =>
    expect(ingredientLines()).toEqual([
      '1 dlOatsdl doesn’t convert to g, so this line is left out of the totals.',
      '60 gOats',
      '2 st2 lemonsIt no longer exists, so it is left out of the totals.',
    ]),
  )
  // Only the 60 g counts.
  expect(nutrition()).toEqual([
    ['Energy', '233 kcal'],
    ['Protein', '10.1 g'],
  ])
})

test('a line in dl of an ingredient with a dl conversion converts, and is not flagged', async () => {
  const dl = recipe({ id: 9, name: 'Porridge', sections: [{ name: '', items: [{ ingredient_id: 1, amount: '1', unit: 'dl', original_text: '' }, { ingredient_id: 1, amount: '60', unit: '', original_text: '' }] }] })
  await open({
    'GET /api/recipes/9': { body: dl },
    'GET /api/ingredients': { body: [{ ...oats, conversions: [conversion({ id: 1, unit: 'dl', factor: '40' })] }, milk, almonds] },
  })
  await waitFor(() => expect(nutrition()).toEqual([['Energy', '389 kcal'], ['Protein', '16.9 g']]))
  expect(ingredientLines()).toEqual(['1 dlOats', '60 gOats'])
})

test('the nutrition table gives one portion: the whole recipe over the servings', async () => {
  const layered = recipe({
    id: 9,
    name: 'Layered',
    servings: 4,
    sections: [
      { name: 'Base', items: [{ ingredient_id: 1, amount: '200', unit: '', original_text: '' }] },
      { name: 'Topping', items: [{ ingredient_id: 3, amount: '40', unit: '', original_text: '' }] },
    ],
  })
  await open({ 'GET /api/recipes/9': { body: layered } })
  // 200 g oats is 778 kcal and 33.8 g protein; 40 g almonds 8.4 g protein; over 4 portions.
  await waitFor(() => expect(nutrition()).toEqual([['Energy', '195 kcal'], ['Protein', '10.6 g']]))
})

test('without the unit catalogue the server’s totals are shown and no unit is flagged', async () => {
  const stale = recipe({
    id: 9,
    name: 'Porridge',
    sections: [{ name: '', items: [{ ingredient_id: 1, amount: '1', unit: 'dl', original_text: '' }] }],
    totals: [{ attribute_id: 1, value: '155.6' }, { attribute_id: 2, value: '6.76' }],
  })
  await open({ 'GET /api/recipes/9': { body: stale }, 'GET /api/units': 500 })
  expect(nutrition()).toEqual([['Energy', '156 kcal'], ['Protein', '6.8 g']])
  expect(ingredientLines()).toEqual(['1 dlOats'])
})

test('the method is numbered, one step per paragraph', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, instructions: 'Boil the milk.\n\nStir in the oats\nslowly.\n\n\nServe.' } } })
  const method = within(screen.getByRole('region', { name: 'Method' }))
  expect(method.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Boil the milk.', 'Stir in the oats\nslowly.', 'Serve.'])
  expect(method.getByRole('list').tagName).toBe('OL')
})

test('without blank lines the method has a step per line; without instructions there is no method', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, instructions: 'Boil.\nStir.\n' } } })
  const method = within(screen.getByRole('region', { name: 'Method' }))
  expect(method.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Boil.', 'Stir.'])
})

test('a recipe without instructions has no method section', async () => {
  await open()
  expect(screen.queryByRole('region', { name: 'Method' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Notes' })).toBeDefined()
})

test('the tags are listed in tag order, the ones from the ingredients marked', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, extra_tag_ids: [2, 3], derived_tag_ids: [3, 1] } } })
  const notes = within(screen.getByRole('region', { name: 'Notes' }))
  expect(notes.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['vegan', 'quick', 'contains-nuts'])
  expect(notes.getByText('From the ingredients: vegan, contains-nuts')).toBeDefined()
})

test('the source is a readable link in a new tab', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, source_url: 'https://www.example.com/porridge/' } } })
  const link = screen.getByRole('link', { name: /^example\.com\/porridge ?\(opens in a new tab\)$/ })
  expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual([
    'https://www.example.com/porridge/',
    '_blank',
    'noopener noreferrer',
  ])
})

test('a source that is not an http(s) link is not offered', async () => {
  await open({ 'GET /api/recipes/9': { body: { ...porridge, source_url: 'javascript:alert(1)' } } })
  expect(screen.queryByText('Source')).toBeNull()
  expect(screen.queryByRole('link', { name: /alert/ })).toBeNull()
})

test('Back to the index returns to the list', async () => {
  const { user, router } = await open({ 'GET /api/recipes': { body: [] } })
  await user.click(screen.getByRole('link', { name: 'Back to the index' }))
  expect(router.state.location.pathname).toBe('/recipes')
})

test('Edit opens the edit mode, and Cancel returns to the spread with focus on Edit', async () => {
  const { user } = await open()
  await user.click(screen.getByRole('button', { name: 'Edit Porridge' }))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Editing Porridge')
  expect(screen.queryByRole('link', { name: 'Back to the index' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Porridge')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Porridge' }))
})

test('an unknown recipe fails to load, with Try again', async () => {
  fakeServer({
    'GET /api/session': 204,
    'GET /api/attributes': { body: [] },
    'GET /api/tags': { body: [] },
    'GET /api/ingredients': { body: [] },
    'GET /api/recipes/9': 404,
    ...unitRoutes(),
  })
  await mountApp('/recipes/9')
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Could not load the recipe.')
  expect(within(alert).getByRole('button', { name: 'Try again' })).toBeDefined()
})

test('the spread rules: steps, plate numerals, portions and links', () => {
  expect(methodSteps('  \n ')).toEqual([])
  expect(methodSteps('A\r\n\r\nB')).toEqual(['A', 'B'])
  expect([1, 4, 9, 14, 40, 1999].map(plateNumeral)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIX'])
  expect(plateNumeral(4000)).toBe('4000')
  expect(['0.5', '0.250', '1.5', '2', '0.4', '1.75'].map(portionText)).toEqual(['½', '¼', '1½', '2', '0.4', '1¾'])
  expect(sourceLink('http://example.com')).toEqual({ href: 'http://example.com', text: 'example.com' })
  expect(sourceLink('ftp://example.com')).toBeNull()
  expect(sourceLink('')).toBeNull()
})

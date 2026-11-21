import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { attribute } from '../../../test-data'
import { fakeServer, mountApp, unitRoutes, type FakeServer } from '../../test-app'

// The Attributes page through the app seam. A port of the Vue AttributesPage
// tests other than the unit-change question (ticket 37, in UnitChange.test.tsx).

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1, ingredient_count: 12, goal_count: 1 })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy, protein] },
    // another spelling of the same unit: no question (its tests are in UnitChange.test.tsx)
    'POST /api/attributes/1/unit-change': { body: { kind: 'same', factor: null, counts: {}, rounded: 0, refusal: null } },
    ...server,
  })
  const app = await mountApp('/attributes')
  await screen.findByRole('list')
  return { ...app, calls }
}

/** The closed entries' text, in order. */
function entries() {
  return within(screen.getByRole('list'))
    .queryAllByRole('button')
    .filter((button) => button.classList.contains('attributes-entry'))
    .map((button) => button.textContent)
}

function entry(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}\\b`) })
}

function openForm() {
  return screen.getByRole('form')
}

function field(name: string) {
  return within(openForm()).getByRole('textbox', { name }) as HTMLInputElement
}

function unitBox() {
  return within(openForm()).getByRole('combobox', { name: 'Unit' }) as HTMLInputElement
}

/** The text of what describes a control (its hint and error). */
function description(control: HTMLElement) {
  return (control.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ')
}

test('the page lists each attribute with its unit, decimals and goals', async () => {
  await mountPage()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Attributes')
  expect(screen.getByText('2 tracked')).toBeDefined()
  expect(screen.getByText('What you track for every ingredient, and can set goals on.')).toBeDefined()
  expect(entries()).toEqual(['Energy kcal 0 decimals · no goals', 'Protein g 1 decimal · 1 goal'])
  expect(screen.getByRole('button', { name: '+ New attribute' })).toBeDefined()
})

test('an entry opens in place, and Done saves the changes and closes it', async () => {
  let saved: unknown
  const { user } = await mountPage({
    'PUT /api/attributes/2': (body) => {
      saved = body
      return { body: { ...protein, ...(body as object) } }
    },
  })
  await user.click(entry('Protein'))

  expect(openForm().getAttribute('aria-label')).toBe('Editing Protein')
  expect(field('Name').value).toBe('Protein')
  expect(document.activeElement).toBe(field('Name'))
  expect(unitBox().value).toBe('g')
  expect(field('Decimals').value).toBe('1')
  expect(description(field('Decimals'))).toBe('How precisely the planner counts it: 1 → 0.1 g.')

  await user.clear(field('Name'))
  await user.type(field('Name'), 'Protein total')
  await user.clear(field('Decimals'))
  await user.type(field('Decimals'), '2')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))

  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  expect(saved).toEqual({ name: 'Protein total', unit: 'g', decimals: 2 })
  expect(entries()[1]).toBe('Protein total g 2 decimals · 1 goal')
  expect(document.activeElement).toBe(entry('Protein total'))
})

test('Enter in a field saves too', async () => {
  let saved: unknown
  const { user } = await mountPage({
    'PUT /api/attributes/1': (body) => {
      saved = body
      return { body: { ...energy, ...(body as object) } }
    },
  })
  await user.click(entry('Energy'))
  await user.type(field('Name'), ' total{Enter}')
  await waitFor(() => expect(saved).toEqual({ name: 'Energy total', unit: 'kcal', decimals: 0 }))
})

test('Done without changes saves nothing', async () => {
  const { user, calls } = await mountPage()
  await user.click(entry('Energy'))
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))
  expect(screen.queryByRole('form')).toBeNull()
  expect(calls.filter((call) => call.startsWith('PUT'))).toEqual([])
})

test('opening another entry saves the open one first', async () => {
  const { user, calls } = await mountPage({
    'PUT /api/attributes/1': (body) => ({ body: { ...energy, ...(body as object) } }),
  })
  await user.click(entry('Energy'))
  await user.clear(unitBox())
  await user.type(unitBox(), 'IU')
  await user.click(entry('Protein'))

  await waitFor(() => expect(openForm().getAttribute('aria-label')).toBe('Editing Protein'))
  expect(calls).toContain('PUT /api/attributes/1')
  expect(entries()[0]).toBe('Energy IU 0 decimals · no goals')
  expect(field('Name').value).toBe('Protein')
})

test('a failed save keeps the entry open with what was typed, and opening another waits', async () => {
  const { user } = await mountPage({ 'PUT /api/attributes/1': 500 })
  await user.click(entry('Energy'))
  await user.type(field('Name'), ' total')
  await user.click(entry('Protein'))

  expect((await within(openForm()).findByRole('alert')).textContent).toBe('Could not save. Try again.')
  expect(openForm().getAttribute('aria-label')).toBe('Editing Energy')
  expect(field('Name').value).toBe('Energy total')
  expect(entries()).toEqual(['Protein g 1 decimal · 1 goal'])
})

test('a name in use is shown on the name field, and the entry stays open', async () => {
  const { user } = await mountPage({
    'PUT /api/attributes/2': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await user.click(entry('Protein'))
  await user.clear(field('Name'))
  await user.type(field('Name'), 'Energy')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))

  await waitFor(() => expect(field('Name').getAttribute('aria-invalid')).toBe('true'))
  expect(description(field('Name'))).toBe('An attribute with this name already exists.')
  expect(field('Name').value).toBe('Energy')
})

test('an empty name or decimals outside 0 to 6 are shown on their fields and not sent', async () => {
  const { user, calls } = await mountPage()
  await user.click(entry('Protein'))
  await user.clear(field('Name'))
  await user.type(field('Name'), ' ')
  await user.clear(field('Decimals'))
  await user.type(field('Decimals'), '7')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))

  expect(field('Name').getAttribute('aria-invalid')).toBe('true')
  expect(description(field('Name'))).toBe('Enter a name.')
  expect(document.activeElement).toBe(field('Name'))
  expect(field('Decimals').getAttribute('aria-invalid')).toBe('true')
  expect(description(field('Decimals'))).toBe('How precisely the planner counts it. A whole number from 0 to 6.')
  expect(calls.filter((call) => call.startsWith('PUT'))).toEqual([])

  // editing a field takes its message away
  await user.type(field('Name'), 'Protein')
  expect(field('Name').getAttribute('aria-invalid')).toBeNull()
  expect(field('Decimals').getAttribute('aria-invalid')).toBe('true')
})

test("a unit the server refuses shows the server's sentence under the unit until the unit is edited", async () => {
  const { user } = await mountPage({
    'PUT /api/attributes/1': {
      status: 422,
      body: { detail: [{ loc: ['body', 'unit'], type: 'unit_mismatch', msg: 'Unmap TEST Protein first.' }] },
    },
  })
  await user.click(entry('Energy'))
  await user.clear(unitBox())
  await user.type(unitBox(), 'g')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))

  await waitFor(() => expect(unitBox().getAttribute('aria-invalid')).toBe('true'))
  expect(description(unitBox())).toContain('Unmap TEST Protein first.')
  expect(document.activeElement).toBe(unitBox())
  expect(unitBox().value).toBe('g')

  await user.type(unitBox(), 'r')
  expect(unitBox().getAttribute('aria-invalid')).toBeNull()
  expect(description(unitBox())).not.toContain('Unmap')
})

test('a new attribute is added in place, at the end of the list', async () => {
  let created: unknown
  const { user } = await mountPage({
    'POST /api/attributes': (body) => {
      created = body
      return { status: 201, body: { ...(body as object), id: 3, ingredient_count: 0, goal_count: 0, mapping_count: 0 } }
    },
  })
  await user.click(screen.getByRole('button', { name: '+ New attribute' }))

  expect(openForm().getAttribute('aria-label')).toBe('New attribute')
  expect(screen.queryByRole('button', { name: '+ New attribute' })).toBeNull()
  expect(field('Name').value).toBe('')
  expect(unitBox().value).toBe('')
  expect(field('Decimals').value).toBe('3')
  await user.type(field('Name'), 'Fibre')
  await user.type(unitBox(), 'g')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))

  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  expect(created).toEqual({ name: 'Fibre', unit: 'g', decimals: 3 })
  expect(entries()).toEqual(['Energy kcal 0 decimals · no goals', 'Protein g 1 decimal · 1 goal', 'Fibre g 3 decimals · no goals'])
  expect(screen.getByText('3 tracked')).toBeDefined()
})

test('a new attribute can be saved without a unit, or cancelled', async () => {
  let created: unknown
  const { user, calls } = await mountPage({
    'POST /api/attributes': (body) => {
      created = body
      return { status: 201, body: { ...(body as object), id: 3, ingredient_count: 0, goal_count: 0, mapping_count: 0 } }
    },
  })
  await user.click(screen.getByRole('button', { name: '+ New attribute' }))
  await user.click(within(openForm()).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('form')).toBeNull()
  expect(entries()).toHaveLength(2)
  expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ New attribute' }))

  await user.click(screen.getByRole('button', { name: '+ New attribute' }))
  await user.type(field('Name'), 'Score')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(created).toEqual({ name: 'Score', unit: '', decimals: 3 }))
  expect(entries()[2]).toBe('Score  3 decimals · no goals')
})

test('delete says what else it removes, and deletes only when confirmed', async () => {
  const { user, calls } = await mountPage({ 'DELETE /api/attributes/2': 204 })
  await user.click(entry('Protein'))
  await user.click(within(openForm()).getByRole('button', { name: 'Delete' }))

  const sheet = await screen.findByRole('alertdialog', { name: 'Delete Protein?' })
  expect(description(sheet)).toBe('This also removes its values from 12 ingredients and 1 goal.')
  expect(calls).not.toContain('DELETE /api/attributes/2')

  await user.click(within(sheet).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(entries()).toEqual(['Energy kcal 0 decimals · no goals']))
  expect(calls).toContain('DELETE /api/attributes/2')
  expect(screen.queryByRole('form')).toBeNull()
})

test('delete says the mapping from source columns is cleared, or that nothing else uses it', async () => {
  const fat = attribute({ id: 3, name: 'Fat', unit: 'g', mapping_count: 2 })
  const fibre = attribute({ id: 4, name: 'Fibre', unit: 'g', ingredient_count: 2, goal_count: 0, mapping_count: 1 })
  const score = attribute({ id: 5, name: 'Score' })
  const { user, calls } = await mountPage({ 'GET /api/attributes': { body: [fat, fibre, score] } })

  const ask = async (name: string) => {
    await user.click(entry(name))
    await user.click(within(openForm()).getByRole('button', { name: 'Delete' }))
    const sheet = await screen.findByRole('alertdialog', { name: `Delete ${name}?` })
    const text = description(sheet)
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    return text
  }

  expect(await ask('Fat')).toBe('Its mapping from 2 source columns is cleared.')
  expect(await ask('Fibre')).toBe('This also removes its values from 2 ingredients and no goals. Its mapping from 1 source column is cleared.')
  expect(await ask('Score')).toBe('Nothing else uses it.')
  expect(calls.filter((call) => call.startsWith('DELETE'))).toEqual([])
})

test('a failed delete keeps the entry open and says so', async () => {
  const { user } = await mountPage({ 'DELETE /api/attributes/2': 500 })
  await user.click(entry('Protein'))
  await user.click(within(openForm()).getByRole('button', { name: 'Delete' }))
  const sheet = await screen.findByRole('alertdialog', { name: 'Delete Protein?' })
  await user.click(within(sheet).getByRole('button', { name: 'Delete' }))
  expect((await within(openForm()).findByRole('alert')).textContent).toBe('Could not delete. Try again.')
  expect(entries()).toEqual(['Energy kcal 0 decimals · no goals'])
})

test('the unit list offers mass, volume and energy, and the unit has its hint', async () => {
  const { user } = await mountPage()
  await user.click(entry('Protein'))
  expect(description(unitBox())).toBe("The amount per the ingredient's basis, e.g. g or kcal.")
  await user.click(unitBox())
  await user.keyboard('{ArrowDown}')
  const list = screen.getByRole('listbox', { name: 'Unit' })
  expect(within(list).getAllByRole('group').map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['Mass', 'Volume', 'Energy'])
})

test('a unit chosen from the list is sent as its symbol', async () => {
  let saved: unknown
  const { user } = await mountPage({
    'PUT /api/attributes/1': (body) => {
      saved = body
      return { body: { ...energy, ...(body as object) } }
    },
  })
  await user.click(entry('Energy'))
  await user.clear(unitBox())
  await user.type(unitBox(), 'kilojoule')
  await user.click(screen.getByRole('option', { name: /^kJ/ }))
  expect(unitBox().value).toBe('kJ')
  await user.click(within(openForm()).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(saved).toEqual({ name: 'Energy', unit: 'kJ', decimals: 0 }))
})

test('no attributes yet says so, and the first can be added', async () => {
  fakeServer({ 'GET /api/session': 204, ...unitRoutes(), 'GET /api/attributes': { body: [] } })
  const { user } = await mountApp('/attributes')
  expect(await screen.findByText('No attributes yet.')).toBeDefined()
  expect(screen.getByText('Nothing tracked yet')).toBeDefined()
  await user.click(screen.getByRole('button', { name: '+ New attribute' }))
  expect(screen.queryByText('No attributes yet.')).toBeNull()
  expect(field('Name').value).toBe('')
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = { 'GET /api/session': 204, ...unitRoutes(), 'GET /api/attributes': 500 }
  fakeServer(server)
  const { user } = await mountApp('/attributes')
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load the attributes.')
  server['GET /api/attributes'] = { body: [energy] }
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('list')
  expect(entries()).toEqual(['Energy kcal 0 decimals · no goals'])
})

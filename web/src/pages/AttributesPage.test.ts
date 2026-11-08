import { afterEach, expect, test, vi } from 'vitest'
import { resetPreferences } from '../preferences'
import {
  button,
  chooseUnit,
  click,
  dialog,
  fakeServer,
  field,
  mountApp,
  openUnitList,
  texts,
  unitRoutes,
  type FakeServer,
} from '../test-app'
import { attribute, unitChange, unitChangeRefusal } from '../test-data'
import { resetUnits } from '../units'

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const protein = attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1, ingredient_count: 12, goal_count: 1 })

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy, protein] },
    ...server,
  })
  const { wrapper } = await mountApp('/attributes')
  return { wrapper, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function rows(wrapper: Wrapper) {
  return texts(wrapper, '.attribute-row')
}

test('each attribute shows its unit, decimals and goals', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Attributes')
  expect(rows(wrapper)).toEqual([
    expect.stringMatching(/Energy\s*\(kcal\)\s*0 decimals · no goals/),
    expect.stringMatching(/Protein\s*\(g\)\s*1 decimal · 1 goal/),
  ])
  wrapper.unmount()
})

test('a row opens in place, and Done saves the changes', async () => {
  let saved: unknown
  const { wrapper } = await mountPage({
    'PUT /api/attributes/2': (body) => {
      saved = body
      return { body: { ...protein, ...(body as object) } }
    },
  })
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  expect(field(wrapper, 'Name').element.value).toBe('Protein')
  expect(field(wrapper, 'Unit').element.value).toBe('g')
  expect(field(wrapper, 'Decimals').element.value).toBe('1')
  expect(wrapper.text()).toContain('1\u00a0→\u00a00.1\u00a0g')

  await field(wrapper, 'Name').setValue('Protein total')
  await field(wrapper, 'Decimals').setValue('2')
  await click(button(wrapper, 'Done'))

  expect(saved).toEqual({ name: 'Protein total', unit: 'g', decimals: 2 })
  expect(wrapper.find('input[aria-label="Name"]').exists()).toBe(false)
  expect(rows(wrapper)[1]).toMatch(/Protein total\s*\(g\)\s*2 decimals · 1 goal/)
  wrapper.unmount()
})

test('Done without changes saves nothing', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  await click(button(wrapper, 'Done'))
  expect(calls).not.toContain('PUT /api/attributes/1')
  expect(wrapper.find('input[aria-label="Name"]').exists()).toBe(false)
  wrapper.unmount()
})

test('a name in use is shown on the name field, and the row stays open', async () => {
  const { wrapper } = await mountPage({
    'PUT /api/attributes/2': {
      status: 409,
      body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' }] },
    },
  })
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  await field(wrapper, 'Name').setValue('Energy')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('An attribute with this name already exists.')
  expect(field(wrapper, 'Name').element.value).toBe('Energy')
  wrapper.unmount()
})

test('an empty name or decimals outside 0 to 6 are not sent', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  await field(wrapper, 'Name').setValue(' ')
  await field(wrapper, 'Decimals').setValue('7')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('Enter a name.')
  expect(wrapper.text()).toContain('A whole number from 0 to 6.')
  expect(calls).not.toContain('PUT /api/attributes/2')
  wrapper.unmount()
})

test('opening another row saves the open one first (the unit change confirmed)', async () => {
  const { wrapper, calls } = await mountPage({
    'POST /api/attributes/1/unit-change': { body: unitChange({ kind: 'no_convert', factor: null }) },
    'PUT /api/attributes/1': (body) => ({ body: { ...energy, ...(body as object) } }),
  })
  await click(wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  await field(wrapper, 'Unit').setValue('IU')
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  await dialog().click('Change unit')
  expect(calls).toContain('PUT /api/attributes/1')
  expect(rows(wrapper)[0]).toMatch(/Energy\s*\(IU\)/)
  expect(field(wrapper, 'Name').element.value).toBe('Protein')
  wrapper.unmount()
})

test('a new attribute is added at the end of the list', async () => {
  let created: unknown
  const { wrapper } = await mountPage({
    'POST /api/attributes': (body) => {
      created = body
      return { status: 201, body: { ...(body as object), id: 3, ingredient_count: 0, goal_count: 0 } }
    },
  })
  await click(button(wrapper, '+ New attribute'))
  expect(field(wrapper, 'Name').element.value).toBe('')
  expect(field(wrapper, 'Decimals').element.value).toBe('3')
  await field(wrapper, 'Name').setValue('Fibre')
  await field(wrapper, 'Unit').setValue('g')
  await click(button(wrapper, 'Done'))
  expect(created).toEqual({ name: 'Fibre', unit: 'g', decimals: 3 })
  expect(rows(wrapper)).toHaveLength(3)
  expect(rows(wrapper)[2]).toMatch(/Fibre\s*\(g\)\s*3 decimals · no goals/)
  wrapper.unmount()
})

test('a new attribute can be cancelled', async () => {
  const { wrapper, calls } = await mountPage()
  await click(button(wrapper, '+ New attribute'))
  await click(button(wrapper, 'Cancel'))
  expect(rows(wrapper)).toHaveLength(2)
  expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  wrapper.unmount()
})

test('delete warns what else it removes, then deletes', async () => {
  const { wrapper, calls } = await mountPage({ 'DELETE /api/attributes/2': 204 })
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  await click(button(wrapper, 'Delete'))
  expect(dialog().text).toContain('Delete Protein?')
  expect(dialog().text).toContain('This also removes its values from 12 ingredients and 1 goal.')
  expect(calls).not.toContain('DELETE /api/attributes/2')

  await dialog().click('Delete')
  expect(calls).toContain('DELETE /api/attributes/2')
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

test('an unused attribute says nothing else uses it', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  await click(button(wrapper, 'Delete'))
  expect(dialog().text).toContain('Nothing else uses it.')
  wrapper.unmount()
})

test('a failed load offers to try again', async () => {
  const server: FakeServer = { 'GET /api/session': 204, 'GET /api/attributes': 500 }
  fakeServer(server)
  const { wrapper } = await mountApp('/attributes')
  expect(wrapper.text()).toContain('Could not load the attributes.')
  server['GET /api/attributes'] = { body: [energy] }
  await click(button(wrapper, 'Try again'))
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

test('the open row has the unit list with mass, volume and energy, and its help text', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  expect(field(wrapper, 'Unit').element.value).toBe('g')
  expect(wrapper.text()).toContain("The amount per the ingredient's basis, e.g. g or kcal.")
  const rows = await openUnitList(wrapper, 'Unit')
  expect(rows.filter((row) => row.startsWith('#'))).toEqual(['# Mass', '# Volume', '# Energy'])
  expect(rows[rows.indexOf('# Energy') + 1]).toBe('kcal (kilocalorie)')
  expect(rows).not.toContain('st (piece)')
  wrapper.unmount()
})

test('a unit chosen from the list is sent as its symbol, typed text as typed (unit changes confirmed)', async () => {
  const saved: unknown[] = []
  const { wrapper } = await mountPage({
    'POST /api/attributes/1/unit-change': { body: unitChange({ kind: 'no_convert', factor: null }) },
    'PUT /api/attributes/1': (body) => {
      saved.push(body)
      return { body: { ...energy, ...(body as object) } }
    },
  })
  await click(wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  await chooseUnit(wrapper, 'Unit', 'kJ (kilojoule)')
  await click(button(wrapper, 'Done'))
  await dialog().click('Change unit')
  await click(wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  await field(wrapper, 'Unit').setValue('gram')
  await click(button(wrapper, 'Done'))
  await dialog().click('Change unit')
  expect(saved).toEqual([
    { name: 'Energy', unit: 'kJ', decimals: 0 },
    { name: 'Energy', unit: 'gram', decimals: 0 },
  ])
  wrapper.unmount()
})

test('a new attribute opens with an empty unit and saves with it empty', async () => {
  let created: unknown
  const { wrapper } = await mountPage({
    'POST /api/attributes': (body) => {
      created = body
      return { status: 201, body: { ...(body as object), id: 3, ingredient_count: 0, goal_count: 0 } }
    },
  })
  await click(button(wrapper, '+ New attribute'))
  expect(field(wrapper, 'Unit').element.value).toBe('')
  await field(wrapper, 'Name').setValue('Score')
  await click(button(wrapper, 'Done'))
  expect(created).toEqual({ name: 'Score', unit: '', decimals: 3 })
  wrapper.unmount()
})

// Changing the unit of a saved attribute: the preview, then the dialog.

async function openEnergy(server: FakeServer = {}) {
  const sent: unknown[] = []
  const previews: unknown[] = []
  const page = await mountPage({
    'POST /api/attributes/1/unit-change': (body) => {
      previews.push(body)
      return { body: unitChange({ counts: { ingredient_values: 12, goals: 2 } }) }
    },
    'PUT /api/attributes/1': (body) => {
      sent.push(body)
      return { body: { ...energy, ...(body as object) } }
    },
    ...server,
  })
  await click(page.wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  return { ...page, sent, previews }
}

test('a unit change asks first, and Convert saves it', async () => {
  const { wrapper, sent, previews } = await openEnergy()
  await field(wrapper, 'Unit').setValue('kJ')
  await click(button(wrapper, 'Done'))
  expect(previews).toEqual([{ unit: 'kJ', decimals: 0 }])
  expect(sent).toEqual([])
  expect(dialog().text).toContain("Convert Energy's numbers?")
  expect(dialog().text).toContain('Energy: 12 ingredient values and 2 goals will be converted from kcal to kJ (× 1000).')
  await dialog().click('Convert')
  expect(sent).toEqual([{ name: 'Energy', unit: 'kJ', decimals: 0 }])
  expect(wrapper.find('input[aria-label="Name"]').exists()).toBe(false)
  expect(rows(wrapper)[0]).toMatch(/Energy\s*\(kJ\)/)
  wrapper.unmount()
})

test('Cancel saves nothing and keeps the row open with the typed unit', async () => {
  const { wrapper, sent } = await openEnergy()
  await field(wrapper, 'Unit').setValue('kJ')
  await click(button(wrapper, 'Done'))
  await dialog().click('Cancel')
  expect(sent).toEqual([])
  expect(field(wrapper, 'Unit').element.value).toBe('kJ')
  wrapper.unmount()
})

test('another category says the numbers keep their value, then saves', async () => {
  const { wrapper, sent } = await openEnergy({
    'POST /api/attributes/1/unit-change': { body: unitChange({ kind: 'no_convert', factor: null }) },
  })
  await field(wrapper, 'Unit').setValue('IU')
  await click(button(wrapper, 'Done'))
  expect(dialog().text).toContain('Energy: 12 ingredient values and 2 goals keep their numbers.')
  await dialog().click('Change unit')
  expect(sent).toEqual([{ name: 'Energy', unit: 'IU', decimals: 0 }])
  wrapper.unmount()
})

test('another spelling of the same unit saves with no dialog', async () => {
  const { wrapper, sent } = await openEnergy({
    'POST /api/attributes/1/unit-change': { body: unitChange({ kind: 'same', factor: null }) },
  })
  await field(wrapper, 'Unit').setValue('Kcal')
  await click(button(wrapper, 'Done'))
  expect(sent).toEqual([{ name: 'Energy', unit: 'Kcal', decimals: 0 }])
  expect(document.querySelector('.q-dialog')).toBeNull()
  wrapper.unmount()
})

test('a refusal shows under the unit field, and asking again uses the raised decimals', async () => {
  const previews: unknown[] = []
  const refusal = unitChangeRefusal({
    type: 'conversion_needs_decimals', kind: 'goal', name: 'Energy per day', field: 'min',
    number: '0.5', converted: '0.0005', decimals_needed: 4,
  })
  const { wrapper, sent } = await openEnergy({
    'POST /api/attributes/1/unit-change': (body) => {
      previews.push(body)
      return { body: unitChange({ refusal: (body as { decimals: number }).decimals < 4 ? refusal : null }) }
    },
  })
  await field(wrapper, 'Unit').setValue('kJ')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain("The goal Energy per day's minimum (0.5 kcal) would need 4 decimals as kJ. Raise Energy's decimals first.")
  expect(document.querySelector('.q-dialog')).toBeNull()
  expect(sent).toEqual([])
  expect(field(wrapper, 'Unit').element.value).toBe('kJ')
  await field(wrapper, 'Decimals').setValue('4')
  await click(button(wrapper, 'Done'))
  expect(previews).toEqual([{ unit: 'kJ', decimals: 0 }, { unit: 'kJ', decimals: 4 }])
  expect(wrapper.text()).not.toContain('would need')
  await dialog().click('Convert')
  expect(sent).toEqual([{ name: 'Energy', unit: 'kJ', decimals: 4 }])
  wrapper.unmount()
})

test('editing the unit clears a refusal', async () => {
  const { wrapper } = await openEnergy({
    'POST /api/attributes/1/unit-change': {
      body: unitChange({ refusal: unitChangeRefusal({ type: 'conversion_too_large', kind: 'goal', name: 'Energy per day', field: 'max', number: '1', converted: '9', decimals_needed: null }) }),
    },
  })
  await field(wrapper, 'Unit').setValue('kJ')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('which is too large')
  await field(wrapper, 'Unit').setValue('J')
  expect(wrapper.text()).not.toContain('which is too large')
  wrapper.unmount()
})

test('a preview that fails saves nothing and says so', async () => {
  const { wrapper, sent } = await openEnergy({ 'POST /api/attributes/1/unit-change': 500 })
  await field(wrapper, 'Unit').setValue('kJ')
  await click(button(wrapper, 'Done'))
  expect(wrapper.text()).toContain('Could not save')
  expect(sent).toEqual([])
  expect(document.querySelector('.q-dialog')).toBeNull()
  wrapper.unmount()
})

test("a save refused after the preview shows the server's sentence under the unit", async () => {
  const { wrapper } = await openEnergy({
    'PUT /api/attributes/1': {
      status: 422,
      body: { detail: [{ loc: ['body', 'unit'], type: 'conversion_needs_decimals', msg: 'Energy per day, min: 0.5 would need 4 decimals' }] },
    },
  })
  await field(wrapper, 'Unit').setValue('kJ')
  await click(button(wrapper, 'Done'))
  await dialog().click('Convert')
  expect(wrapper.text()).toContain('Energy per day, min: 0.5 would need 4 decimals')
  expect(field(wrapper, 'Unit').element.value).toBe('kJ')
  wrapper.unmount()
})

test('a new attribute and an unchanged unit never ask', async () => {
  const { wrapper, calls } = await openEnergy()
  await field(wrapper, 'Name').setValue('Energy total')
  await click(button(wrapper, 'Done'))
  await click(button(wrapper, '+ New attribute'))
  await field(wrapper, 'Name').setValue('Score')
  await field(wrapper, 'Unit').setValue('pts')
  await click(button(wrapper, 'Done'))
  expect(calls.filter((call) => call.includes('unit-change'))).toEqual([])
  wrapper.unmount()
})

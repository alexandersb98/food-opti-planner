import { afterEach, expect, test, vi } from 'vitest'
import { button, click, dialog, fakeServer, field, mountApp, texts, type FakeServer } from '../test-app'

const energy = { id: 1, name: 'Energy', unit: 'kcal', decimals: 0, ingredient_count: 0, goal_count: 0 }
const protein = { id: 2, name: 'Protein', unit: 'g', decimals: 1, ingredient_count: 12, goal_count: 1 }

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
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

test('opening another row saves the open one first', async () => {
  const { wrapper, calls } = await mountPage({
    'PUT /api/attributes/1': (body) => ({ body: { ...energy, ...(body as object) } }),
  })
  await click(wrapper.findAll('.attribute-row')[0]!.get('.q-item'))
  await field(wrapper, 'Unit').setValue('kJ')
  await click(wrapper.findAll('.attribute-row')[1]!.get('.q-item'))
  expect(calls).toContain('PUT /api/attributes/1')
  expect(rows(wrapper)[0]).toMatch(/Energy\s*\(kJ\)/)
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

import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import type { Conversion } from '../api/types'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { dialog, fakeServer, settleMenu, unitRoutes, type FakeServer } from '../test-app'
import { conversion, ingredient } from '../test-data'
import { resetUnits } from '../units'
import ConversionsCard from './ConversionsCard.vue'

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountCard(conversions: Conversion[], server: FakeServer = {}) {
  const calls = fakeServer({ ...unitRoutes(), ...server })
  const changed: Conversion[][] = []
  const wrapper = mount(ConversionsCard, {
    props: {
      ingredient: ingredient({ id: 3, name: 'Oats', unit: 'g', conversions }),
      onChanged: (list: Conversion[]) => changed.push(list),
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, calls, changed }
}

type Wrapper = Awaited<ReturnType<typeof mountCard>>['wrapper']

const rowTexts = (wrapper: Wrapper) => wrapper.findAll('.conversion-text').map((row) => row.text())
const rows = (wrapper: Wrapper) => wrapper.findAll('.conversion-row')

async function press(wrapper: Wrapper, label: string, row = 0) {
  await rows(wrapper)[row]!.get(`button[aria-label="${label}"]`).trigger('click')
  await flushPromises()
}

async function fill(label: string, text: string) {
  const element = document.querySelector<HTMLInputElement>(`.conversion-dialog input[aria-label="${label}"]`)!
  element.value = text
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

const dl = conversion({ id: 1, unit: 'dl', factor: '100' })

test('a conversion reads "1 dl = 100 g"', async () => {
  const { wrapper } = await mountCard([dl, conversion({ id: 2, unit: 'pinch', factor: '0.3' })])
  expect(rowTexts(wrapper)).toEqual(['1 dl = 100 g', '1 pinch = 0.3 g'])
  wrapper.unmount()
})

test('an AI conversion has a sparkle with its tooltip and a user one has none', async () => {
  const { wrapper } = await mountCard([
    conversion({ id: 1, unit: 'dl', factor: '100', source: 'ai' }),
    conversion({ id: 2, unit: 'pinch', factor: '0.3' }),
  ])
  expect(rows(wrapper)[0]!.find('.ai-mark').text()).toContain('✨')
  expect(rows(wrapper)[1]!.find('.ai-mark').exists()).toBe(false)
  wrapper.unmount()
})

test('an empty list says so', async () => {
  const { wrapper } = await mountCard([])
  expect(wrapper.text()).toContain('No conversions yet.')
  expect(rows(wrapper)).toHaveLength(0)
  wrapper.unmount()
})

test('Add opens the dialog, and a saved conversion is passed up with the others', async () => {
  const made = conversion({ id: 9, unit: 'pinch', factor: '0.3' })
  const { wrapper, changed } = await mountCard([dl], { 'POST /api/ingredients/3/conversions': { status: 201, body: made } })
  await wrapper.findAll('button').find((b) => b.text() === '+ Add conversion')!.trigger('click')
  await flushPromises()
  await settleMenu()
  expect(dialog().text).toContain('New unit')
  await fill('Unit', 'pinch')
  await fill('How many g one makes', '0.3')
  await dialog().click('Save')
  expect(changed).toEqual([[dl, made]])
  wrapper.unmount()
})

test('Edit saves the conversion and passes the list up', async () => {
  const edited = conversion({ id: 1, unit: 'dl', factor: '110', source: 'user' })
  const { wrapper, changed } = await mountCard([dl, conversion({ id: 2, unit: 'pinch', factor: '0.3' })], {
    'PUT /api/ingredients/3/conversions/1': { body: edited },
  })
  await press(wrapper, 'Edit the conversion for dl')
  await settleMenu()
  expect(dialog().text).toContain('Edit conversion')
  await fill('How many g one makes', '110')
  await dialog().click('Save')
  expect(changed[0]!.map((c) => [c.id, c.factor])).toEqual([[1, '110'], [2, '0.3']])
  wrapper.unmount()
})

test('Delete asks, calls DELETE and passes the list without it', async () => {
  const { wrapper, changed, calls } = await mountCard([dl, conversion({ id: 2, unit: 'pinch', factor: '0.3' })], {
    'DELETE /api/ingredients/3/conversions/1': 204,
  })
  await press(wrapper, 'Delete the conversion for dl')
  expect(dialog().text).toContain('Delete the conversion for dl?')
  await dialog().click('Delete')
  expect(calls).toContain('DELETE /api/ingredients/3/conversions/1')
  expect(changed[0]!.map((c) => c.id)).toEqual([2])
  wrapper.unmount()
})

test('Delete is disabled while a recipe uses the conversion, which says where', async () => {
  const { wrapper } = await mountCard([conversion({ id: 1, unit: 'dl', factor: '100', recipe_count: 2 })])
  expect(rows(wrapper)[0]!.text()).toContain('Used in 2 recipes')
  expect(rows(wrapper)[0]!.get('button[aria-label="Delete the conversion for dl"]').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

test('one recipe reads "Used in 1 recipe"', async () => {
  const { wrapper } = await mountCard([conversion({ id: 1, unit: 'dl', factor: '100', recipe_count: 1 })])
  expect(rows(wrapper)[0]!.text()).toContain('Used in 1 recipe')
  expect(rows(wrapper)[0]!.text()).not.toContain('recipes')
  wrapper.unmount()
})

test('a 409 on delete shows why and keeps the row', async () => {
  const { wrapper, changed } = await mountCard([dl], { 'DELETE /api/ingredients/3/conversions/1': { status: 409, body: { detail: 'Recipes use this conversion' } } })
  await press(wrapper, 'Delete the conversion for dl')
  await dialog().click('Delete')
  expect(wrapper.text()).toContain("Can't be deleted while a recipe uses it.")
  expect(changed).toEqual([])
  expect(rows(wrapper)).toHaveLength(1)
  wrapper.unmount()
})

test('a failed delete says so', async () => {
  const { wrapper } = await mountCard([dl], { 'DELETE /api/ingredients/3/conversions/1': 500 })
  await press(wrapper, 'Delete the conversion for dl')
  await dialog().click('Delete')
  expect(wrapper.text()).toContain('Could not delete the conversion.')
  wrapper.unmount()
})

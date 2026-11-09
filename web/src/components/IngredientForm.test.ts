import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { button, click, fakeServer, field, unitRoutes, type FakeServer } from '../test-app'
import { attribute, ingredient } from '../test-data'
import { resetUnits } from '../units'
import IngredientForm from './IngredientForm.vue'

const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
const oats = ingredient({ id: 7, name: 'Oats', values: [{ attribute_id: 1, value: '389' }] })

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountForm(props: { id: number | null; initialName?: string }, server: FakeServer = {}) {
  const saved: unknown[] = []
  const deleted: number[] = []
  const calls = fakeServer({
    ...unitRoutes(),
    'GET /api/attributes': { body: [energy] },
    'GET /api/tags': { body: [] },
    'GET /api/ingredients/7': { body: oats },
    ...server,
  })
  const wrapper = mount(IngredientForm, {
    props: { ...props, onSaved: (i: unknown) => saved.push(i), onDeleted: () => deleted.push(1) },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, calls, saved, deleted }
}

test('a new ingredient starts with the initial name filled in', async () => {
  const { wrapper } = await mountForm({ id: null, initialName: 'Rye flour' })
  expect(field(wrapper, 'Name').element.value).toBe('Rye flour')
  expect(wrapper.text()).toContain('Save the ingredient to add conversions')
  wrapper.unmount()
})

test('a new ingredient without an initial name starts empty', async () => {
  const { wrapper } = await mountForm({ id: null })
  expect(field(wrapper, 'Name').element.value).toBe('')
  wrapper.unmount()
})

test('saving a new ingredient emits saved with the stored ingredient', async () => {
  const stored = ingredient({ id: 9, name: 'Rye flour' })
  const { wrapper, saved, calls } = await mountForm(
    { id: null, initialName: 'Rye flour' },
    { 'POST /api/ingredients': { status: 201, body: stored } },
  )
  await click(button(wrapper, 'Save'))
  expect(calls).toContain('POST /api/ingredients')
  expect(saved).toEqual([stored])
  wrapper.unmount()
})

test('a missing name is marked and nothing is sent or emitted', async () => {
  const { wrapper, saved, calls } = await mountForm({ id: null })
  await click(button(wrapper, 'Save'))
  expect(calls).not.toContain('POST /api/ingredients')
  expect(saved).toEqual([])
  expect(wrapper.text()).toContain('Enter a name')
  wrapper.unmount()
})

test('an existing ingredient is filled in and ignores the initial name', async () => {
  const { wrapper } = await mountForm({ id: 7, initialName: 'Other' })
  expect([field(wrapper, 'Name').element.value, field(wrapper, 'Energy').element.value]).toEqual(['Oats', '389'])
  wrapper.unmount()
})

test('deleting an ingredient emits deleted', async () => {
  const { wrapper, deleted } = await mountForm({ id: 7 }, { 'DELETE /api/ingredients/7': 204 })
  await click(button(wrapper, 'Delete'))
  const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Delete').pop()!
  confirm.click()
  await flushPromises()
  expect(deleted).toEqual([1])
  wrapper.unmount()
})

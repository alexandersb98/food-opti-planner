import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { fakeServer, unitRoutes, type FakeServer } from '../test-app'
import { attribute, ingredient } from '../test-data'
import { resetUnits } from '../units'
import NewIngredientDialog from './NewIngredientDialog.vue'

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountDialog(server: FakeServer = {}) {
  const saved: unknown[] = []
  const closed: boolean[] = []
  const calls = fakeServer({
    ...unitRoutes(),
    'GET /api/attributes': { body: [attribute({ id: 1, name: 'Energy', unit: 'kcal' })] },
    'GET /api/tags': { body: [] },
    ...server,
  })
  const wrapper = mount(NewIngredientDialog, {
    props: {
      modelValue: true,
      initialName: 'Milk',
      'onUpdate:modelValue': (open: boolean) => {
        closed.push(open)
        void wrapper.setProps({ modelValue: open })
      },
      onSaved: (i: unknown) => saved.push(i),
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, calls, saved, closed }
}

const nameInput = () => document.querySelector<HTMLInputElement>('.q-dialog input[aria-label="Name"]')!
const dialogButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.q-dialog button')].find((b) => b.textContent?.trim() === label)!

test('opens with the name filled in, and Save emits the created ingredient and closes at once', async () => {
  const stored = ingredient({ id: 9, name: 'Milk' })
  const { wrapper, saved, closed, calls } = await mountDialog({ 'POST /api/ingredients': { status: 201, body: stored } })
  expect(nameInput().value).toBe('Milk')
  dialogButton('Save').click()
  await flushPromises()
  expect(calls.filter((c) => c === 'POST /api/ingredients')).toHaveLength(1)
  expect(saved).toEqual([stored])
  expect(closed).toEqual([false])
  wrapper.unmount()
})

test("the server's name_in_use shows on the field and the dialog stays open", async () => {
  const refusal = { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'x' }] } }
  const { wrapper, saved, closed } = await mountDialog({ 'POST /api/ingredients': refusal })
  dialogButton('Save').click()
  await flushPromises()
  expect(document.querySelector('.q-dialog')!.textContent).toContain('already exists')
  expect(saved).toEqual([])
  expect(closed).toEqual([])
  wrapper.unmount()
})

test('Cancel closes and emits nothing', async () => {
  const { wrapper, saved, closed } = await mountDialog()
  dialogButton('Cancel').click()
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(saved).toEqual([])
  expect(closed).toEqual([false])
  wrapper.unmount()
})

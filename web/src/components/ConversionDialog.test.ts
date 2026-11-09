import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import type { Conversion } from '../api/types'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { fakeServer, settleMenu, unitRoutes, type FakeServer } from '../test-app'
import { conversion, ingredient } from '../test-data'
import { resetUnits } from '../units'
import ConversionDialog from './ConversionDialog.vue'

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const oats = ingredient({ id: 3, name: 'Oats', unit: 'g' })

async function mountDialog(existing: Conversion | null = null, server: FakeServer = {}) {
  const calls = fakeServer({ ...unitRoutes(), ...server })
  const saved: Conversion[] = []
  const closed: boolean[] = []
  const wrapper = mount(ConversionDialog, {
    props: {
      modelValue: false,
      ingredient: oats,
      conversion: existing,
      'onUpdate:modelValue': (value: boolean) => {
        closed.push(value)
        void wrapper.setProps({ modelValue: value })
      },
      onSaved: (made: Conversion) => saved.push(made),
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  await settleMenu()
  return { wrapper, calls, saved, closed }
}

function input(label: string) {
  const element = document.querySelector<HTMLInputElement>(`.conversion-dialog input[aria-label="${label}"]`)
  expect(element, `field ${label}`).not.toBeNull()
  return element!
}

async function type(label: string, text: string) {
  const element = input(label)
  element.value = text
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function press(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.conversion-dialog button')].find(
    (b) => b.textContent?.trim() === label,
  )
  expect(found, `button ${label}`).toBeDefined()
  found!.click()
  await flushPromises()
}

const text = () => document.querySelector('.conversion-dialog')?.textContent ?? ''
const posts = (calls: string[]) => calls.filter((call) => call.startsWith('POST') || call.startsWith('PUT'))
const FACTOR = 'How many g one makes'

test('adding posts the unit and factor, emits the saved conversion and closes', async () => {
  const sent: unknown[] = []
  const made = conversion({ id: 9, unit: 'dl', factor: '40' })
  const { wrapper, saved, closed } = await mountDialog(null, {
    'POST /api/ingredients/3/conversions': (body) => {
      sent.push(body)
      return { status: 201, body: made }
    },
  })
  expect(text()).toContain('New unit')
  await type('Unit', 'dl')
  await type(FACTOR, '40')
  await press('Save')
  expect(sent).toEqual([{ unit: 'dl', factor: '40' }])
  expect(saved).toEqual([made])
  expect(closed.at(-1)).toBe(false)
  wrapper.unmount()
})

test('editing puts to the conversion and starts with its values', async () => {
  const sent: unknown[] = []
  const existing = conversion({ id: 5, unit: 'dl', factor: '40' })
  const { wrapper, saved } = await mountDialog(existing, {
    'PUT /api/ingredients/3/conversions/5': (body) => {
      sent.push(body)
      return { body: { ...existing, factor: '45', source: 'user' } }
    },
  })
  expect(text()).toContain('Edit conversion')
  expect(input('Unit').value).toBe('dl')
  expect(input(FACTOR).value).toBe('40')
  await type(FACTOR, '45')
  await press('Save')
  expect(sent).toEqual([{ unit: 'dl', factor: '45' }])
  expect(saved[0]!.factor).toBe('45')
  wrapper.unmount()
})

test('the factor label names the ingredient\'s own unit', async () => {
  const { wrapper } = await mountDialog()
  expect(text()).toContain('How many g one makes')
  wrapper.unmount()
})

test('an empty unit and a factor that is not above 0 show their errors and send nothing', async () => {
  const { wrapper, calls } = await mountDialog()
  await type(FACTOR, '0')
  await press('Save')
  expect(text()).toContain('Enter a unit.')
  expect(text()).toContain('Enter a number above 0.')
  expect(posts(calls)).toEqual([])
  await type('Unit', 'dl')
  await type(FACTOR, 'abc')
  await press('Save')
  expect(text()).toContain('Enter a number above 0.')
  expect(posts(calls)).toEqual([])
  wrapper.unmount()
})

test.each([
  ['unit_is_own_unit', 'unit', "That is the ingredient's own unit."],
  ['duplicate', 'unit', 'This ingredient has a conversion for that unit already.'],
  ['unit_not_for_ingredient', 'unit', 'An ingredient is measured in an amount of food'],
  ['decimal_max_places', 'factor', 'Use at most 9 digits before the point and 6 after.'],
])('the server refusing %s shows on the %s field', async (type_, field, message) => {
  const { wrapper, closed } = await mountDialog(null, {
    'POST /api/ingredients/3/conversions': {
      status: 422,
      body: { detail: [{ loc: ['body', field], type: type_, msg: 'x' }] },
    },
  })
  await type('Unit', 'dl')
  await type(FACTOR, '40')
  await press('Save')
  expect(text()).toContain(message)
  expect(closed).toEqual([])
  wrapper.unmount()
})

test('a conversion in use refuses a new unit with its own text', async () => {
  const existing = conversion({ id: 5, unit: 'dl', factor: '40', recipe_count: 2 })
  const { wrapper } = await mountDialog(existing, {
    'PUT /api/ingredients/3/conversions/5': {
      status: 409,
      body: { detail: [{ loc: ['body', 'unit'], type: 'conversion_in_use', msg: 'x' }] },
    },
  })
  await type('Unit', 'msk')
  await press('Save')
  expect(text()).toContain('A recipe uses this unit, so only the number can change.')
  wrapper.unmount()
})

test('a failed save says so', async () => {
  const { wrapper } = await mountDialog(null, { 'POST /api/ingredients/3/conversions': 500 })
  await type('Unit', 'dl')
  await type(FACTOR, '40')
  await press('Save')
  expect(text()).toContain('Could not save the conversion.')
  wrapper.unmount()
})

test('Cancel sends nothing', async () => {
  const { wrapper, calls } = await mountDialog()
  await type('Unit', 'dl')
  await type(FACTOR, '40')
  await press('Cancel')
  expect(posts(calls)).toEqual([])
  wrapper.unmount()
})

import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { fakeServer, settleMenu, unitRoutes, type FakeServer } from '../test-app'
import { attribute, sourceColumn } from '../test-data'
import { resetUnits } from '../units'
import type { Attribute, SourceColumn } from '../api/types'
import NewAttributeDialog from './NewAttributeDialog.vue'

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const gramColumn = sourceColumn({ id: 2, name: 'TEST Protein', unit: 'g' })

async function mountDialog(column: SourceColumn | null = gramColumn, server: FakeServer = {}, prefs = {}) {
  const calls = fakeServer({ ...unitRoutes(prefs), ...server })
  const created: Attribute[] = []
  const closed: boolean[] = []
  const wrapper = mount(NewAttributeDialog, {
    props: {
      modelValue: false,
      column,
      'onUpdate:modelValue': (value: boolean) => {
        closed.push(value)
        void wrapper.setProps({ modelValue: value })
      },
      onCreated: (made: Attribute) => created.push(made),
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await openIt(wrapper)
  return { wrapper, calls, created, closed }
}

type Wrapper = Awaited<ReturnType<typeof mountDialog>>['wrapper']

async function openIt(wrapper: Wrapper) {
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  await settleMenu()
}

function input(label: string) {
  const element = document.querySelector<HTMLInputElement>(`.new-attribute-dialog input[aria-label="${label}"]`)
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
  const found = [...document.querySelectorAll<HTMLButtonElement>('.new-attribute-dialog button')].find(
    (b) => b.textContent?.trim() === label,
  )
  expect(found, `button ${label}`).toBeDefined()
  found!.click()
  await flushPromises()
}

const text = () => document.querySelector('.new-attribute-dialog')?.textContent ?? ''

test('it opens with an empty name, 3 decimals and the preferred unit of the column category', async () => {
  const { wrapper } = await mountDialog(gramColumn, {}, { 'unit.mass': 'kg' })
  expect(text()).toContain('New attribute')
  expect(input('Name').value).toBe('')
  expect(input('Unit').value).toBe('kg')
  expect(input('Decimals').value).toBe('3')
  wrapper.unmount()
})

test('a kcal column starts with the preferred energy unit', async () => {
  const { wrapper } = await mountDialog(sourceColumn({ id: 1, name: 'TEST Energy', unit: 'kcal' }), {}, { 'unit.energy': 'kJ' })
  expect(input('Unit').value).toBe('kJ')
  wrapper.unmount()
})

test('a column in free text starts with its own unit, and so does st', async () => {
  for (const unit of ['dose', 'st']) {
    const { wrapper } = await mountDialog(sourceColumn({ id: 5, name: 'TEST Other', unit }))
    expect(input('Unit').value).toBe(unit)
    wrapper.unmount()
    document.body.innerHTML = ''
  }
})

test('the unit list offers the column category only', async () => {
  const { wrapper } = await mountDialog()
  const control = input('Unit').closest('.q-field__control')!
  control.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await settleMenu()
  const rows = [...document.querySelectorAll('.q-menu .q-item, .q-menu .q-item__label--header')].map((r) => r.textContent?.trim())
  expect(rows).toEqual(['Mass', 'g (gram)', 'µg (microgram)', 'mg (milligram)', 'kg (kilogram)', 'oz (ounce)', 'lb (pound)'])
  wrapper.unmount()
})

test('an empty name and out-of-range decimals show their errors and send nothing', async () => {
  const { wrapper, calls } = await mountDialog()
  await type('Decimals', '9')
  await press('Add')
  expect(text()).toContain('Enter a name.')
  expect(text()).toContain('A whole number from 0 to 6.')
  expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  wrapper.unmount()
})

test('a unit that does not convert with the column shows that and sends nothing', async () => {
  const { wrapper, calls } = await mountDialog()
  await type('Name', 'Protein')
  await type('Unit', 'kcal')
  await press('Add')
  expect(text()).toContain('Must convert with g.')
  expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  wrapper.unmount()
})

test('a good form posts the attribute, emits created and closes', async () => {
  const sent: unknown[] = []
  const made = attribute({ id: 9, name: 'Protein', unit: 'g', decimals: 1 })
  const { wrapper, created, closed } = await mountDialog(gramColumn, {
    'POST /api/attributes': (body) => {
      sent.push(body)
      return { status: 201, body: made }
    },
  })
  await type('Name', ' Protein ')
  await type('Decimals', '1')
  await press('Add')
  expect(sent).toEqual([{ name: 'Protein', unit: 'g', decimals: 1 }])
  expect(created).toEqual([made])
  expect(closed).toEqual([false])
  wrapper.unmount()
})

test('a name in use shows on the name field and the dialog stays open', async () => {
  const { wrapper, created } = await mountDialog(gramColumn, {
    'POST /api/attributes': { status: 409, body: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: 'x' }] } },
  })
  await type('Name', 'Protein')
  await press('Add')
  expect(text()).toContain('An attribute with this name already exists.')
  expect(created).toEqual([])
  wrapper.unmount()
})

test('a failing save says so and the dialog stays open', async () => {
  const { wrapper, created, closed } = await mountDialog(gramColumn, { 'POST /api/attributes': 500 })
  await type('Name', 'Protein')
  await press('Add')
  expect(document.querySelector('.new-attribute-dialog [role="alert"]')?.textContent).toContain('Could not save.')
  expect(created).toEqual([])
  expect(closed).toEqual([])
  wrapper.unmount()
})

test('opening again after a cancel shows a fresh form', async () => {
  const { wrapper } = await mountDialog()
  await type('Name', 'Half typed')
  await type('Decimals', '9')
  await press('Add')
  await press('Cancel')
  await new Promise((resolve) => setTimeout(resolve, 400))
  await openIt(wrapper)
  expect(input('Name').value).toBe('')
  expect(input('Decimals').value).toBe('3')
  expect(text()).not.toContain('Enter a name.')
  wrapper.unmount()
})

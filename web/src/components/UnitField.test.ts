import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { resetPreferences } from '../preferences'
import { fakeServer, field, unitRoutes, type FakeServer } from '../test-app'
import { resetUnits } from '../units'
import UnitField from './UnitField.vue'

afterEach(() => {
  resetUnits()
  resetPreferences()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

type Groups = ('mass' | 'volume' | 'energy' | 'piece')[]

async function mountField(
  props: { modelValue?: string; categories?: Groups; error?: boolean; errorMessage?: string } = {},
  server: FakeServer = unitRoutes(),
) {
  fakeServer(server)
  const sent: string[] = []
  const wrapper = mount(UnitField, {
    props: {
      modelValue: '',
      label: 'Unit',
      categories: ['mass', 'volume', 'piece'],
      'onUpdate:modelValue': (text: string) => sent.push(text),
      ...props,
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await flushPromises()
  sentBy.set(wrapper, sent)
  return wrapper
}

const sentBy = new WeakMap<object, string[]>()

type Wrapper = Awaited<ReturnType<typeof mountField>>

const input = (wrapper: Wrapper) => field(wrapper, 'Unit')

/** Quasar fills a menu's virtual list a moment after it opens. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 60))
  await flushPromises()
}

async function open(wrapper: Wrapper) {
  await wrapper.get('.q-field__control').trigger('click')
  await settle()
  return listed()
}

/** The open menu's rows: headers as "# Name", entries as their label. */
function listed() {
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)
  if (!menu) return []
  return [...menu.querySelectorAll<HTMLElement>('.q-item, .q-item__label--header')].map((row) =>
    row.classList.contains('q-item__label--header') ? `# ${row.textContent?.trim()}` : (row.textContent?.trim() ?? ''),
  )
}

async function type(wrapper: Wrapper, text: string) {
  await input(wrapper).setValue(text)
  await settle()
}

async function choose(label: string) {
  const row = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')].find((r) => r.textContent?.trim() === label)
  expect(row, `option ${label}`).toBeDefined()
  row!.click()
  await settle()
}

/** What the field sent through update:modelValue (the wrapper's own record also holds Quasar's inner events). */
const emitted = (wrapper: Wrapper) => sentBy.get(wrapper)!

test('lists mass, volume and other, the preferred unit first in each group', async () => {
  const wrapper = await mountField()
  const rows = await open(wrapper)
  const mass = rows.indexOf('# Mass')
  const volume = rows.indexOf('# Volume')
  const other = rows.indexOf('# Other')
  expect([mass, volume, other].every((i) => i >= 0) && mass < volume && volume < other).toBe(true)
  expect(rows.slice(mass + 1, volume)).toEqual([
    'g (gram)',
    'µg (microgram)',
    'mg (milligram)',
    'kg (kilogram)',
    'oz (ounce)',
    'lb (pound)',
  ])
  expect(rows[volume + 1]).toBe('dl (decilitre)')
  expect(rows.slice(volume + 1, other)).toContain('ml (millilitre)')
  expect(rows.slice(other)).toEqual(['# Other', 'st (piece)'])
  expect(rows.some((row) => row.startsWith('kcal') || row === '# Energy')).toBe(false)
  wrapper.unmount()
})

test('with energy there is an Energy group, kcal first, and no Other group', async () => {
  const wrapper = await mountField({ categories: ['mass', 'volume', 'energy'] })
  const rows = await open(wrapper)
  const energy = rows.indexOf('# Energy')
  expect(rows.slice(energy)).toEqual(['# Energy', 'kcal (kilocalorie)', 'kJ (kilojoule)'])
  expect(rows).not.toContain('# Other')
  expect(rows).not.toContain('st (piece)')
  wrapper.unmount()
})

test('a changed preference reorders its group', async () => {
  const wrapper = await mountField({}, unitRoutes({ 'unit.mass': 'kg' }))
  const rows = await open(wrapper)
  const mass = rows.indexOf('# Mass')
  expect(rows[mass + 1]).toBe('kg (kilogram)')
  expect(rows[mass + 2]).toBe('µg (microgram)')
  expect(rows.slice(mass + 1, rows.indexOf('# Volume'))).toContain('g (gram)')
  wrapper.unmount()
})

test('choosing a unit emits its symbol once and the box shows it', async () => {
  const wrapper = await mountField()
  await open(wrapper)
  await choose('kg (kilogram)')
  expect(emitted(wrapper)).toEqual(['kg'])
  await wrapper.setProps({ modelValue: 'kg' })
  await flushPromises()
  expect(input(wrapper).element.value).toBe('kg')
  expect(emitted(wrapper)).toEqual(['kg'])
  wrapper.unmount()
})

test('typed text is emitted as typed, at every keystroke, and filters the list', async () => {
  const wrapper = await mountField()
  await open(wrapper)
  await type(wrapper, 'gram')
  expect(emitted(wrapper)).toEqual(['gram'])
  await wrapper.setProps({ modelValue: 'gram' })
  await type(wrapper, 'tbs')
  expect(emitted(wrapper)).toEqual(['gram', 'tbs'])
  expect(listed().filter((row) => !row.startsWith('#'))).toEqual(['msk (tablespoon)'])
  await wrapper.setProps({ modelValue: 'tbs' })
  await type(wrapper, 'zzz')
  expect(emitted(wrapper)).toEqual(['gram', 'tbs', 'zzz'])
  expect(listed().filter((row) => !row.startsWith('#'))).toEqual([])
  await wrapper.setProps({ modelValue: 'zzz' })
  await type(wrapper, '')
  expect(emitted(wrapper)).toEqual(['gram', 'tbs', 'zzz', ''])
  wrapper.unmount()
})

test('typing a part of a name keeps the entry', async () => {
  const wrapper = await mountField()
  await open(wrapper)
  await type(wrapper, 'gra')
  expect(listed()).toContain('g (gram)')
  wrapper.unmount()
})

test('a header cannot be chosen', async () => {
  const wrapper = await mountField()
  await open(wrapper)
  const header = document.querySelector<HTMLElement>('.q-menu .q-item__label--header')!
  header.click()
  await flushPromises()
  expect(emitted(wrapper)).toEqual([])
  wrapper.unmount()
})

test('opening and closing the list without a choice emits nothing', async () => {
  const wrapper = await mountField({ modelValue: 'dl' })
  await open(wrapper)
  await input(wrapper).trigger('blur')
  document.body.click()
  await flushPromises()
  expect(emitted(wrapper)).toEqual([])
  expect(input(wrapper).element.value).toBe('dl')
  wrapper.unmount()
})

test('a value that is not in the list is shown as it is', async () => {
  for (const value of ['pcs', 'pinch']) {
    const wrapper = await mountField({ modelValue: value })
    expect(input(wrapper).element.value).toBe(value)
    wrapper.unmount()
    resetUnits()
    resetPreferences()
  }
})

test('without the catalogue the field takes typed text and shows an empty list', async () => {
  const wrapper = await mountField({}, { 'GET /api/preferences': { body: {} } })
  expect(await open(wrapper)).toEqual([])
  await type(wrapper, 'pinch')
  expect(emitted(wrapper)).toEqual(['pinch'])
  wrapper.unmount()
})

test('the label names the input and an error shows', async () => {
  const wrapper = await mountField({ error: true, errorMessage: 'Enter a unit.' })
  expect(input(wrapper).attributes('aria-label')).toBe('Unit')
  expect(wrapper.text()).toContain('Enter a unit.')
  wrapper.unmount()
})

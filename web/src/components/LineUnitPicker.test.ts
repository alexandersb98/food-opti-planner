import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { fakeServer, settleMenu, unitRoutes } from '../test-app'
import { conversion, ingredient } from '../test-data'
import { resetUnits } from '../units'
import type { Conversion } from '../api/types'
import LineUnitPicker from './LineUnitPicker.vue'

afterEach(() => {
  resetUnits()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPicker(unit = 'g', conversions: Conversion[] = [], modelValue = '', catalogue = true) {
  fakeServer(catalogue ? unitRoutes() : {})
  const sent: string[] = []
  const wrapper = mount(LineUnitPicker, {
    props: {
      ingredient: ingredient({ id: 1, name: 'Oats', unit, conversions }),
      modelValue,
      name: 'Oats',
      'onUpdate:modelValue': (value: string) => sent.push(value),
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, sent }
}

type Picker = Awaited<ReturnType<typeof mountPicker>>

async function open({ wrapper }: Picker) {
  await wrapper.get('.q-field__control').trigger('click')
  await settleMenu()
  return rows()
}

function rows() {
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)
  if (!menu) return []
  return [...menu.querySelectorAll<HTMLElement>('.q-item, .q-item__label--header')].map((row) =>
    row.classList.contains('q-item__label--header') ? `# ${row.textContent?.trim()}` : (row.textContent?.trim() ?? ''),
  )
}

async function choose(label: string) {
  const row = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')].find((r) => r.textContent?.trim() === label)
  expect(row, `option ${label}`).toBeDefined()
  row!.click()
  await settleMenu()
}

const dl = conversion({ id: 1, unit: 'dl', factor: '40' })

test('a gram ingredient offers its own unit, then the mass units and no volume ones', async () => {
  const picker = await mountPicker()
  expect(await open(picker)).toEqual([
    "# Ingredient's unit",
    'g',
    '# Other units',
    'µg (microgram)',
    'mg (milligram)',
    'kg (kilogram)',
    'oz (ounce)',
    'lb (pound)',
    'New unit…',
  ])
  picker.wrapper.unmount()
})

test('a dl conversion adds the volume units, and dl only under Conversions with its factor', async () => {
  const picker = await mountPicker('g', [dl])
  const list = await open(picker)
  expect(list).toContain('ml (millilitre)')
  expect(list).toContain('msk (tablespoon)')
  expect(list).not.toContain('dl (decilitre)')
  const conversions = list.indexOf('# Conversions')
  expect(list.slice(conversions)).toEqual(['# Conversions', 'dl= 40 g', 'New unit…'])
  picker.wrapper.unmount()
})

test('an AI conversion has a sparkle and a user one has not', async () => {
  const picker = await mountPicker('g', [
    conversion({ id: 1, unit: 'dl', factor: '40', source: 'ai' }),
    conversion({ id: 2, unit: 'pinch', factor: '0.3', source: 'user' }),
  ])
  await open(picker)
  const items = [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')]
  const byText = (text: string) => items.find((i) => i.textContent?.includes(text))!
  expect(byText('= 40 g').textContent).toContain('✨')
  expect(byText('= 0.3 g').textContent).not.toContain('✨')
  picker.wrapper.unmount()
})

test('choosing a unit emits it, and choosing the own unit emits an empty one', async () => {
  const picker = await mountPicker('g', [], 'oz')
  await open(picker)
  await choose('kg (kilogram)')
  expect(picker.sent).toEqual(['kg'])
  await open(picker)
  await choose('g')
  expect(picker.sent).toEqual(['kg', ''])
  picker.wrapper.unmount()
})

test('New unit… emits new-unit and leaves the value', async () => {
  const picker = await mountPicker('g', [dl], 'dl')
  await open(picker)
  await choose('New unit…')
  expect(picker.wrapper.emitted('new-unit')).toHaveLength(1)
  expect(picker.sent).toEqual([])
  picker.wrapper.unmount()
})

test('a piece ingredient offers its own unit, its conversions and New unit… only', async () => {
  const picker = await mountPicker('st', [conversion({ id: 1, unit: 'pinch', factor: '2' })])
  expect(await open(picker)).toEqual(["# Ingredient's unit", 'st', '# Conversions', 'pinch= 2 st', 'New unit…'])
  picker.wrapper.unmount()
})

test("the box shows the ingredient's unit for the own unit and the symbol for another", async () => {
  const own = await mountPicker('g', [], '')
  expect(own.wrapper.get('.q-field__native').text()).toBe('g')
  own.wrapper.unmount()
  const other = await mountPicker('dl', [], 'tbsp')
  expect(other.wrapper.get('.q-field__native').text()).toBe('msk')
  other.wrapper.unmount()
})

test('a unit the ingredient cannot take is shown and marked', async () => {
  const picker = await mountPicker('g', [], 'dl')
  expect(picker.wrapper.text()).toContain('dl')
  expect(picker.wrapper.classes()).toContain('unit-stale')
  picker.wrapper.unmount()
})

test('without the catalogue the own unit and the conversions are offered', async () => {
  const picker = await mountPicker('g', [dl], '', false)
  expect(await open(picker)).toEqual(["# Ingredient's unit", 'g', '# Conversions', 'dl= 40 g', 'New unit…'])
  picker.wrapper.unmount()
})

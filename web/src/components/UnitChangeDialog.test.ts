import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { useUnitChange } from '../composables/useUnitChange'
import en from '../i18n/en.json'
import { makeI18n } from '../i18n'
import { dialog } from '../test-app'
import { unitChange } from '../test-data'
import UnitChangeDialog from './UnitChangeDialog.vue'

afterEach(() => {
  useUnitChange().answer(false)
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function ask(change = unitChange(), name = 'Iron', from = 'mg', to = 'µg') {
  const wrapper = mount(UnitChangeDialog, {
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  const answered = useUnitChange().ask({ name, from, to, change })
  await flushPromises()
  return { wrapper, answered }
}

test('a conversion names the numbers, the units and the factor', async () => {
  await ask()
  const text = dialog().text
  expect(text).toContain("Convert Iron's numbers?")
  expect(text).toContain('Iron: 12 ingredient values and 2 goals will be converted from mg to µg (× 1000).')
  expect(text).not.toContain('rounded')
  expect(dialog().text).toContain('Cancel')
  expect(dialog().text).toContain('Convert')
})

test('counts are singular for one and left out for none', async () => {
  await ask(unitChange({ counts: { ingredient_values: 0, goals: 1 } }))
  expect(dialog().text).toContain('Iron: 1 goal will be converted from mg to µg (× 1000).')
  expect(dialog().text).not.toContain('ingredient value')
})

test('an ingredient reads "the basis and 4 recipe amounts"', async () => {
  await ask(unitChange({ factor: '0.001', counts: { basis: 1, recipe_amounts: 4 } }), 'Oats', 'g', 'kg')
  expect(dialog().text).toContain('Oats: the basis and 4 recipe amounts will be converted from g to kg (× 0.001).')
})

test('digits lost are said when there are any', async () => {
  await ask(unitChange({ rounded: 2 }))
  expect(dialog().text).toContain('2 values will be rounded.')
})

test('numbers that keep their value say so, and the button changes the unit', async () => {
  await ask(unitChange({ kind: 'no_convert', factor: null }), 'Iron', 'mg', 'dl')
  expect(dialog().text).toContain('Change unit?')
  expect(dialog().text).toContain('Values are not converted. Iron: 12 ingredient values and 2 goals keep their numbers.')
  await expect(dialog().click('Change unit')).resolves.toBeUndefined()
})

test('with nothing stored in the unit the dialog still asks', async () => {
  await ask(unitChange({ counts: { ingredient_values: 0, goals: 0 } }))
  expect(dialog().text).toContain('Nothing stored in mg needs converting.')
  await dialog().click('Cancel')
  await ask(unitChange({ kind: 'no_convert', factor: null, counts: { goals: 0 } }))
  expect(dialog().text).toContain('Nothing is stored in mg; only the unit changes.')
})

test('a count without text of its own still shows, by its key', async () => {
  await ask(unitChange({ counts: { ingredient_values: 3, recipe_lines: 5 } }))
  expect(dialog().text).toContain('Iron: 3 ingredient values and 5 recipe_lines will be converted')
  expect(dialog().text).not.toContain('unitChange')
})

test('ingredient values and copied source values are both counted', async () => {
  await ask(unitChange({ counts: { ingredient_values: 3, source_values: 2 }, factor: '1000' }), 'Iron', 'mg', 'µg')
  expect(dialog().text).toContain('Iron: 3 ingredient values and 2 source values will be converted from mg to µg (× 1000).')
})

test('every count key the server sends has text of its own', () => {
  // The keys of the converters in server/unit_change.py; a slice that adds one adds it here too.
  for (const key of ['ingredient_values', 'source_values', 'goals', 'basis', 'recipe_amounts']) {
    expect(Object.keys(en.unitChange.counts)).toContain(key)
  }
})

test('Convert answers true and Cancel answers false', async () => {
  const first = await ask()
  await dialog().click('Convert')
  await expect(first.answered).resolves.toBe(true)
  const second = await ask()
  await dialog().click('Cancel')
  await expect(second.answered).resolves.toBe(false)
})

test('a click beside the dialog decides nothing', async () => {
  const { answered } = await ask()
  const settled = vi.fn()
  void answered.then(settled)
  document.querySelector<HTMLElement>('.q-dialog__backdrop')!.click()
  await flushPromises()
  expect(settled).not.toHaveBeenCalled()
  expect(dialog().text).toContain("Convert Iron's numbers?")
})

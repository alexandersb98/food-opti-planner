import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { ingredient } from '../test-data'
import IngredientPicker from './IngredientPicker.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const all = [ingredient({ id: 1, name: 'Oats' }), ingredient({ id: 2, name: 'Milk' }), ingredient({ id: 3, name: 'Oat milk' })]

async function mountPicker(props: { initialSearch?: string; allowNew?: boolean } = {}) {
  const wrapper = mount(IngredientPicker, {
    props: {
      modelValue: false,
      ingredients: all,
      'onUpdate:modelValue': (open: boolean) => wrapper.setProps({ modelValue: open }),
      ...props,
    },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

const rows = () => [...document.querySelectorAll('.picker-row')].map((r) => r.textContent?.trim())
const search = () => document.querySelector<HTMLInputElement>('.q-dialog input')!
const newButton = () => document.querySelector<HTMLButtonElement>('.new-ingredient')

test('without the props nothing changes: all rows, an empty search, no New button', async () => {
  const wrapper = await mountPicker()
  expect(rows()).toHaveLength(3)
  expect(search().value).toBe('')
  expect(newButton()).toBeNull()
  wrapper.unmount()
})

test('initialSearch fills the search box and filters', async () => {
  const wrapper = await mountPicker({ initialSearch: 'oat' })
  expect(search().value).toBe('oat')
  expect(rows()).toEqual(['Oat milkg', 'Oatsg'])
  wrapper.unmount()
})

test('allowNew shows + New ingredient, which emits new and closes the picker', async () => {
  const wrapper = await mountPicker({ allowNew: true, initialSearch: 'zzz' })
  expect(rows()).toEqual([]) // nothing matches, the button is still there
  expect(newButton()!.textContent).toContain('+ New ingredient')
  newButton()!.click()
  await flushPromises()
  expect(wrapper.emitted('new')).toHaveLength(1)
  expect(wrapper.props('modelValue')).toBe(false)
  wrapper.unmount()
})

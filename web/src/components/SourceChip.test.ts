import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { dialog } from '../test-app'
import { ingredientSource } from '../test-data'
import SourceChip from './SourceChip.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountChip(props: { source?: ReturnType<typeof ingredientSource>; busy?: boolean } = {}) {
  return mount(SourceChip, {
    props: { source: ingredientSource(), name: 'Source oats', busy: false, ...props },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
}

async function openConfirmation(wrapper: ReturnType<typeof mountChip>) {
  await wrapper.get('.unlink-button').trigger('click')
  await flushPromises()
}

test('the chip names the source and the food, in the source colour with readable text', () => {
  const wrapper = mountChip()
  const chip = wrapper.get('.source-chip')
  expect(chip.text()).toBe('From TEST Source: TEST Oats')
  expect(chip.attributes('style')).toContain('background-color: rgb(25, 118, 210)')
  expect(chip.attributes('style')).toContain('color: rgb(255, 255, 255)')
  wrapper.unmount()
})

test('a light colour gets dark text', () => {
  const wrapper = mountChip({ source: ingredientSource({ colour: '#ffeb3b' }) })
  expect(wrapper.get('.source-chip').attributes('style')).toContain('color: rgb(29, 29, 29)')
  wrapper.unmount()
})

test('the withdrawn chip shows only for a withdrawn food', () => {
  const wrapper = mountChip()
  expect(wrapper.find('.source-withdrawn').exists()).toBe(false)
  wrapper.unmount()
  const withdrawn = mountChip({ source: ingredientSource({ withdrawn: true }) })
  expect(withdrawn.get('.source-withdrawn').text()).toBe('No longer in the source')
  withdrawn.unmount()
})

test('Unlink from source asks first, naming the ingredient and the source', async () => {
  const wrapper = mountChip()
  await openConfirmation(wrapper)
  expect(dialog().text).toContain('Unlink Source oats from TEST Source?')
  expect(dialog().text).toContain('The ingredient keeps its values and tags.')
  expect(wrapper.emitted('unlink')).toBeUndefined()
  wrapper.unmount()
})

test('Cancel emits nothing', async () => {
  const wrapper = mountChip()
  await openConfirmation(wrapper)
  await dialog().click('Cancel')
  expect(wrapper.emitted('unlink')).toBeUndefined()
  wrapper.unmount()
})

test('Unlink emits once', async () => {
  const wrapper = mountChip()
  await openConfirmation(wrapper)
  await dialog().click('Unlink')
  expect(wrapper.emitted('unlink')).toHaveLength(1)
  wrapper.unmount()
})

test('busy disables the button', () => {
  const wrapper = mountChip({ busy: true })
  expect(wrapper.get('.unlink-button').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

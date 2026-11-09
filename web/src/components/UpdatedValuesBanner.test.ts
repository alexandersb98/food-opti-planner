import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { attribute } from '../test-data'
import UpdatedValuesBanner from './UpdatedValuesBanner.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const attributes = [
  attribute({ id: 1, name: 'Protein', unit: 'g' }),
  attribute({ id: 2, name: 'Iron', unit: 'mg' }),
]

function mountBanner(props: Partial<InstanceType<typeof UpdatedValuesBanner>['$props']> = {}) {
  return mount(UpdatedValuesBanner, {
    props: { updates: [], attributes, busy: false, ...props },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
}

const twoUpdates = [
  { attribute_id: 1, value: '13.5', new_value: '13.8' },
  { attribute_id: 2, value: null, new_value: '4' },
]

test('nothing is rendered without updates', () => {
  const wrapper = mountBanner()
  expect(wrapper.find('.updated-values').exists()).toBe(false)
  wrapper.unmount()
})

test('each update is a line with the attribute, its unit and both numbers', () => {
  const wrapper = mountBanner({ updates: twoUpdates })
  const banner = wrapper.get('.updated-values')
  expect(banner.attributes('role')).toBe('status')
  expect(banner.text()).toContain('Updated values available')
  expect(banner.text()).toContain('The data source has new values for this ingredient.')
  expect(wrapper.findAll('li').map((li) => li.text())).toEqual(['Protein 13.5 g → 13.8 g', 'Iron none → 4 mg'])
  wrapper.unmount()
})

test('Accept and Keep mine each emit their answer once', async () => {
  const wrapper = mountBanner({ updates: twoUpdates })
  await wrapper.get('.accept-updates').trigger('click')
  expect(wrapper.emitted('answer')).toEqual([['accept']])
  await wrapper.get('.keep-updates').trigger('click')
  expect(wrapper.emitted('answer')).toEqual([['accept'], ['keep']])
  wrapper.unmount()
})

test('both buttons are disabled while busy', () => {
  const wrapper = mountBanner({ updates: twoUpdates, busy: true })
  expect(wrapper.get('.accept-updates').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.keep-updates').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

test('an update for an unknown attribute is skipped, and with none left nothing shows', () => {
  const wrapper = mountBanner({ updates: [{ attribute_id: 9, value: '1', new_value: '2' }, twoUpdates[0]] })
  expect(wrapper.findAll('li').map((li) => li.text())).toEqual(['Protein 13.5 g → 13.8 g'])
  wrapper.unmount()
  const none = mountBanner({ updates: [{ attribute_id: 9, value: '1', new_value: '2' }] })
  expect(none.find('.updated-values').exists()).toBe(false)
  none.unmount()
})

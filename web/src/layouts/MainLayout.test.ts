import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { expect, test } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { makeI18n } from '../i18n'
import { makeRouter } from '../router'
import MainLayout from './MainLayout.vue'

async function mountLayout() {
  const router = makeRouter(createMemoryHistory())
  await router.push('/')
  const wrapper = mount(MainLayout, {
    global: { plugins: [Quasar, makeI18n(), router] },
    attachTo: document.body,
  })
  await router.isReady()
  return wrapper
}

test('the menu lists the five pages in order', async () => {
  const wrapper = await mountLayout()
  await wrapper.get('button[aria-label="Menu"]').trigger('click')
  const labels = wrapper.findAll('.q-drawer .q-item__section--main').map((label) => label.text())
  expect(labels).toEqual([
    'Plan',
    'Recipes',
    'Ingredients',
    'Attributes',
    'Tags',
  ])
  wrapper.unmount()
})

test('the start page is the plan', async () => {
  const wrapper = await mountLayout()
  expect(wrapper.get('h1').text()).toBe('Plan')
  wrapper.unmount()
})

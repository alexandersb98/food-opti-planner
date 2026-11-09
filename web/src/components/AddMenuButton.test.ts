import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { QLayout, QPage, QPageContainer } from 'quasar'
import AddMenuButton from './AddMenuButton.vue'
import { settleMenu } from '../test-app'

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountMenu(items: InstanceType<typeof AddMenuButton>['$props']['items']) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/a', '/b'].map((path) => ({ path, component: { render: () => h('div') } })),
  })
  await router.push('/')
  const Host = defineComponent({
    render: () =>
      h(QLayout, null, () => h(QPageContainer, null, () => h(QPage, null, () => h(AddMenuButton, { label: 'Add thing', items })))),
  })
  const wrapper = mount(Host, { global: { plugins: [Quasar, router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

function rows() {
  return [...document.querySelectorAll<HTMLElement>('.q-menu .q-item')]
}

test('the round button has its label and opens a menu of links', async () => {
  const { wrapper, router } = await mountMenu([
    { label: 'First', to: '/a' },
    { label: 'Second', to: '/b' },
  ])
  const fab = wrapper.get('[aria-label="Add thing"]')
  expect(document.querySelector('.q-menu')).toBeNull()
  await fab.trigger('click')
  await settleMenu()
  expect(rows().map((r) => r.textContent?.trim())).toEqual(['First', 'Second'])
  expect(rows().map((r) => r.tagName)).toEqual(['A', 'A'])
  rows()[1]!.click()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/b')
  wrapper.unmount()
})

test('a disabled item is not a link and shows its hint', async () => {
  const { wrapper, router } = await mountMenu([
    { label: 'First', to: '/a' },
    { label: 'Second', to: '/b', disabled: true, hint: 'Needs a thing' },
  ])
  await wrapper.get('[aria-label="Add thing"]').trigger('click')
  await settleMenu()
  const [, second] = rows()
  expect(second!.tagName).not.toBe('A')
  expect(second!.textContent).toContain('Needs a thing')
  expect(second!.getAttribute('aria-disabled')).toBe('true')
  second!.click()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).not.toBe('/b')
  wrapper.unmount()
})

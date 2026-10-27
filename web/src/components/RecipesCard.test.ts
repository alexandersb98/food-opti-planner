import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { fakeServer, type FakeServer } from '../test-app'
import { tag } from '../test-data'
import type { TagFilter } from '../api/types'
import RecipesCard from './RecipesCard.vue'

afterEach(() => {
  vi.unstubAllGlobals()
})

const tags = [tag({ id: 1, name: 'vegetarian' }), tag({ id: 2, name: 'contains-nuts' }), tag({ id: 3, name: 'quick' })]

async function mountCard(filters: TagFilter[], server: FakeServer = {}) {
  const calls = fakeServer({ 'POST /api/plan/recipe-count': { body: { usable: 142, total: 200 } }, ...server })
  const wrapper = mount(RecipesCard, {
    props: { filters, tags },
    global: { plugins: [Quasar, makeI18n()] },
  })
  await flushPromises()
  return { wrapper, calls }
}

test('shows the count from the server and a chip per filter in tag order', async () => {
  const sent: unknown[] = []
  const filters: TagFilter[] = [
    { tag_id: 1, mode: 'only' },
    { tag_id: 2, mode: 'never' },
  ]
  const { wrapper } = await mountCard(filters, {
    'POST /api/plan/recipe-count': (body) => {
      sent.push(body)
      return { body: { usable: 142, total: 200 } }
    },
  })
  expect(wrapper.get('h2').text()).toBe('Recipes')
  expect(wrapper.get('.recipe-count').text()).toBe('142 of 200 recipes can be used')
  expect(wrapper.findAll('.filter-chip').map((chip) => chip.text())).toEqual(['Only: vegetarian', 'Never: contains-nuts'])
  expect(sent).toEqual([{ tag_filters: filters }])
  wrapper.unmount()
})

test('without filters there are no chips', async () => {
  const { wrapper } = await mountCard([])
  expect(wrapper.find('.filter-chip').exists()).toBe(false)
  expect(wrapper.get('.recipe-count').text()).toBe('142 of 200 recipes can be used')
  wrapper.unmount()
})

test('a failed count shows its message', async () => {
  const { wrapper } = await mountCard([{ tag_id: 3, mode: 'only' }], { 'POST /api/plan/recipe-count': 500 })
  expect(wrapper.get('.recipe-count').text()).toBe('Could not count the recipes.')
  expect(wrapper.get('.filter-chip').text()).toBe('Only: quick')
  wrapper.unmount()
})

test('asks again when the filters change, not when they are the same', async () => {
  const { wrapper, calls } = await mountCard([])
  await wrapper.setProps({ filters: [] })
  await flushPromises()
  expect(calls.filter((call) => call === 'POST /api/plan/recipe-count')).toHaveLength(1)
  await wrapper.setProps({ filters: [{ tag_id: 1, mode: 'never' }] })
  await flushPromises()
  expect(calls.filter((call) => call === 'POST /api/plan/recipe-count')).toHaveLength(2)
  wrapper.unmount()
})

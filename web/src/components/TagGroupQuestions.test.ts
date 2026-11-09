import { flushPromises, mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import type { GroupQuestion } from '../api/types'
import { makeI18n } from '../i18n'
import { dialog } from '../test-app'
import { tag } from '../test-data'

import TagGroupQuestions from './TagGroupQuestions.vue'

const tags = [
  tag({ id: 1, name: 'Fish' }),
  tag({ id: 2, name: 'Seafood' }),
  tag({ id: 3, name: 'Fisk och skaldjur' }),
]

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function ask(questions: GroupQuestion[]) {
  const wrapper = mount(TagGroupQuestions, {
    props: { modelValue: true, questions, tags, 'onUpdate:modelValue': (open: boolean) => wrapper.setProps({ modelValue: open }) },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const move: GroupQuestion = { type: 'move_tag', tag_id: 2, from_tag_ids: [3] }
const switchRule: GroupQuestion = { type: 'switch_rule', tag_id: 2, tag_rule: 'any', group_rule: 'all' }
const change: GroupQuestion = { type: 'change_rule', tag_ids: [1, 2, 3], rule: 'all' }

test('a move names the tag and the tags it is equivalent to now', async () => {
  await ask([move])
  expect(dialog().text).toContain('Seafood is equivalent to Fisk och skaldjur. Move Seafood here?')
  expect(dialog().text).toContain("Don't move")
})

test('a switch says the tag rule and the group rule', async () => {
  await ask([switchRule])
  expect(dialog().text).toContain(
    'Seafood gets a recipe tag when any ingredient has it; the group uses all. Switch Seafood to all?',
  )
  expect(dialog().text).toContain("Don't add")
})

test('a rule change names every tag of the group', async () => {
  await ask([change])
  expect(dialog().text).toContain('This changes the rule of all 3 tags in the group: Fish, Seafood, Fisk och skaldjur.')
  expect(dialog().text).toContain('Cancel')
})

test('the questions are asked in turn and answered once, after the last', async () => {
  const wrapper = await ask([move, switchRule, change])
  await dialog().click('Move')
  expect(wrapper.emitted('answer')).toBeUndefined()
  expect(dialog().text).toContain('Switch Seafood to all?')
  await dialog().click("Don't add")
  expect(dialog().text).toContain('changes the rule of all 3 tags')
  await dialog().click('Change')
  expect(wrapper.emitted('answer')).toEqual([[[true, false, true]]])
})

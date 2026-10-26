import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { makeI18n } from '../i18n'
import { useSave } from './useSave'

function form() {
  const errors = reactive({ save: 'an earlier failure' })
  let saver!: ReturnType<typeof useSave>
  mount(
    defineComponent({
      setup() {
        saver = useSave(errors)
        return () => null
      },
    }),
    { global: { plugins: [makeI18n()] } },
  )
  return { errors, ...saver }
}

const refused = { error: { detail: [{ loc: ['body', 'name'], type: 'name_in_use', msg: '' }] } }

test('a save runs `saved` while saving and clears an earlier failure', async () => {
  const { errors, saving, save } = form()
  let savingThen = false
  const saved = await save(
    async () => ({ data: 1 }),
    () => (savingThen = saving.value),
  )
  expect([saved, savingThen, saving.value, errors.save]).toEqual([true, true, false, ''])
})

test('a refusal goes to the fields; one no field shows, or no answer, just failed', async () => {
  const { errors, save } = form()
  const byField: unknown[] = []
  const shown = (fields: unknown) => (byField.push(fields), true)
  expect(await save(async () => refused, () => {}, shown)).toBe(false)
  expect([byField, errors.save]).toEqual([[{ name: 'name_in_use' }], ''])

  await save(async () => refused, () => {})
  expect(errors.save).toBe('Could not save. Try again.')
  errors.save = ''
  await save(() => Promise.reject(new Error('offline')), () => {})
  expect(errors.save).toBe('Could not save. Try again.')
})

test('a delete the server refuses, or that gets no answer, failed', async () => {
  const { errors, remove } = form()
  expect(await remove(async () => ({ response: new Response(null, { status: 204 }) }))).toBe(true)
  expect(errors.save).toBe('')
  expect(await remove(async () => ({ response: new Response(null, { status: 409 }) }))).toBe(false)
  expect(errors.save).toBe('Could not delete. Try again.')
  errors.save = ''
  expect(await remove(() => Promise.reject(new Error('offline')))).toBe(false)
  expect(errors.save).toBe('Could not delete. Try again.')
})

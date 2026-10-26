import { flushPromises, mount } from '@vue/test-utils'
import { Quasar, QSelect, QSlider } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import { makeI18n } from '../i18n'
import { dialog, fakeServer, type FakeServer } from '../test-app'
import { attribute, goal, plan } from '../test-data'
import GoalDialog from './GoalDialog.vue'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const attributes = [
  attribute({ id: 1, name: 'Energy', unit: 'kcal' }),
  attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 }),
]
const protein = goal({ id: 7, attribute_id: 2, min: '120', max: null, importance: 4 })
const energy = goal({ id: 8, attribute_id: 1, min: '1800', max: '2200', must: true, applies_to: 'daily_average' })

/** The sent setup is answered back as the server's, with names. */
function server(extra: FakeServer = {}) {
  const sent: { goals: unknown[] }[] = []
  fakeServer({
    'PUT /api/plan': (body) => {
      sent.push(body as { goals: unknown[] })
      return { body: { ...plan(), ...(body as object) } }
    },
    ...extra,
  })
  return sent
}

async function mountDialog(goalToEdit: ReturnType<typeof goal> | null, goals = [protein, energy]) {
  const wrapper = mount(GoalDialog, {
    props: { modelValue: false, plan: plan({ goals }), attributes, goal: goalToEdit },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

function input(label: string) {
  return document.querySelector<HTMLInputElement>(`.q-dialog input[aria-label="${label}"]`)
}

async function type(label: string, text: string) {
  const element = input(label)!
  element.value = text
  element.dispatchEvent(new Event('input'))
  await flushPromises()
}

test('it opens with the goal’s fields', async () => {
  const wrapper = await mountDialog(protein)
  const { text } = dialog()
  expect(text).toContain('Edit goal')
  expect(input('Min')!.value).toBe('120')
  expect(input('Max')!.value).toBe('')
  expect(wrapper.findComponent(QSelect).props('modelValue')).toBe(2)
  expect(wrapper.findComponent(QSlider).props('modelValue')).toBe(4)
  expect(text).toContain('Delete')
  wrapper.unmount()
})

test('a new goal starts on the first attribute, Each day, Prefer, importance 3, without Delete', async () => {
  const wrapper = await mountDialog(null)
  expect(dialog().text).toContain('Add goal')
  expect(dialog().text).not.toContain('Delete')
  expect(wrapper.findComponent(QSelect).props('modelValue')).toBe(1)
  expect(wrapper.findComponent(QSlider).props('modelValue')).toBe(3)
  const selected = [...document.querySelectorAll('.q-dialog .q-btn-toggle .bg-primary')].map((b) => b.textContent?.trim())
  expect(selected).toEqual(['Each day', 'Prefer'])
  wrapper.unmount()
})

test('importance shows for Prefer only', async () => {
  const wrapper = await mountDialog(protein)
  expect(wrapper.findComponent(QSlider).exists()).toBe(true)
  await dialog().click('Must')
  expect(wrapper.findComponent(QSlider).exists()).toBe(false)
  await dialog().click('Prefer')
  expect(wrapper.findComponent(QSlider).props('modelValue')).toBe(4)
  wrapper.unmount()
})

test('the zero-bound field shows when a bound is 0 and a soft penalty is made, with its example', async () => {
  const wrapper = await mountDialog(null)
  const label = 'Count a miss as a percentage of'
  expect(input(label)).toBeNull()
  await type('Min', '0')
  expect(input(label)).not.toBeNull() // Prefer
  await type(label, '25')
  expect(dialog().text).toContain('With 25 kcal, missing by 5 kcal counts as 20%.')
  await dialog().click('Must')
  expect(input(label)).toBeNull() // a Must goal each day needs none
  await dialog().click('Whole plan · daily average')
  expect(input(label)).not.toBeNull() // its day guard-rail is soft
  await type('Min', '1')
  expect(input(label)).toBeNull()
  wrapper.unmount()
})

test('a goal needs a bound, each a number, and a zero bound a reference above 0', async () => {
  const sent = server()
  const wrapper = await mountDialog(null)
  await dialog().click('Save')
  expect(dialog().text).toContain('Give a minimum, a maximum or both.')
  await type('Min', 'lots')
  await type('Max', '5,5x')
  await dialog().click('Save')
  expect(dialog().text.match(/A number, such as 120 or 1.5./g)).toHaveLength(2)
  await type('Min', '0')
  await type('Max', '')
  await dialog().click('Save')
  expect(dialog().text).toContain('A number above 0.')
  expect(sent).toEqual([])
  wrapper.unmount()
})

test('Save sends the whole setup with a new goal added, a comma taken as the decimal point', async () => {
  const sent = server()
  const wrapper = await mountDialog(null)
  await type('Min', '1,5')
  await dialog().click('Save')
  expect(sent).toEqual([
    {
      ...plan({ goals: [] }),
      goals: [
        { id: 7, attribute_id: 2, min: '120', max: null, applies_to: 'day', must: false, importance: 4, zero_reference: null },
        { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null },
        { id: null, attribute_id: 1, min: '1.5', max: null, applies_to: 'day', must: false, importance: 3, zero_reference: null },
      ],
    },
  ])
  expect(wrapper.emitted('saved')).toHaveLength(1)
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  wrapper.unmount()
})

test('Save sends a changed goal in its place, with the reference only while it is needed', async () => {
  const sent = server()
  const wrapper = await mountDialog(protein)
  await type('Min', '0')
  await type('Count a miss as a percentage of', '25')
  await dialog().click('Must') // a Must goal each day: the reference is dropped
  await dialog().click('Save')
  expect(sent[0]!.goals).toEqual([
    { id: 7, attribute_id: 2, min: '0', max: null, applies_to: 'day', must: true, importance: 4, zero_reference: null },
    { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null },
  ])
  wrapper.unmount()
})

test('Delete removes the goal with one request and closes', async () => {
  const sent = server()
  const wrapper = await mountDialog(protein)
  await dialog().click('Delete')
  expect(sent).toHaveLength(1)
  expect(sent[0]!.goals).toEqual([
    { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null },
  ])
  expect(wrapper.emitted('saved')).toHaveLength(1)
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  wrapper.unmount()
})

test('the server’s field errors show on their fields', async () => {
  const refuse = (loc: string, type: string) => ({
    status: 422,
    body: { detail: [{ loc: ['body', 'goals', 2, loc], type, msg: 'no' }] },
  })
  server({ 'PUT /api/plan': refuse('min', 'min_above_max') })
  const wrapper = await mountDialog(null)
  await type('Min', '9')
  await dialog().click('Save')
  expect(dialog().text).toContain('Must be at most the maximum.')

  fakeServer({ 'PUT /api/plan': refuse('max', 'too_many_decimals') })
  await dialog().click('Save')
  expect(dialog().text).not.toContain('Must be at most the maximum.')
  expect(dialog().text).toContain('At most 0 decimals for Energy.')

  await type('Min', '0') // the reference field shows
  await type('Count a miss as a percentage of', '25')
  fakeServer({ 'PUT /api/plan': refuse('zero_reference', 'needs_reference') })
  await dialog().click('Save')
  expect(dialog().text).toContain('A number above 0.')

  fakeServer({ 'PUT /api/plan': refuse('attribute_id', 'unknown_attribute') })
  await dialog().click('Save')
  expect(dialog().text).toContain('Pick an attribute.')

  fakeServer({ 'PUT /api/plan': 500 })
  await dialog().click('Save')
  expect(dialog().text).toContain('Could not save. Try again.')
  expect(wrapper.emitted('saved')).toBeUndefined()
  wrapper.unmount()
})

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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
// A goal's advanced settings when it has none, as sent.
const noAdvanced = {
  custom_name: null,
  importance_below: null,
  importance_above: null,
  day_guard_rail: true,
  guard_rail_importance: null,
}

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

/** The importance slider labelled `label`, if shown. */
function slider(wrapper: VueWrapper, label: string) {
  return wrapper.findAllComponents(QSlider).find((found) => found.find(`[aria-label="${label}"]`).exists())
}

async function move(wrapper: VueWrapper, label: string, value: number) {
  slider(wrapper, label)!.vm.$emit('update:modelValue', value)
  await flushPromises()
}

/** The switch labelled `label`, if shown. */
function toggle(label: string) {
  return document.querySelector<HTMLElement>(`.q-dialog [role="switch"][aria-label="${label}"]`)
}

async function flip(label: string) {
  toggle(label)!.click()
  await flushPromises()
}

const advancedOpen = () => document.querySelector('.q-dialog .q-expansion-item--expanded') !== null

async function openAdvanced() {
  document.querySelector<HTMLElement>('.q-dialog .q-expansion-item .q-item')!.click()
  await flushPromises()
}

async function pickAttribute(wrapper: VueWrapper, id: number) {
  wrapper.findComponent(QSelect).vm.$emit('update:modelValue', id)
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
  await dialog().click('Daily average')
  expect(input(label)).not.toBeNull() // its day guard-rail is soft
  await flip('Also keep each day in range')
  expect(input(label)).toBeNull() // without it, nothing soft is left
  await flip('Also keep each day in range')
  await type('Min', '1')
  expect(input(label)).toBeNull()
  await type('Min', '-5') // a negative bound would reward a miss, so it counts as 0 too
  expect(input(label)).not.toBeNull()
  wrapper.unmount()
})

test('Applies to has its own short labels', async () => {
  const wrapper = await mountDialog(null)
  const labels = [...document.querySelectorAll('.q-dialog .q-btn-toggle')[0]!.querySelectorAll('.q-btn')].map((b) =>
    b.textContent?.trim(),
  )
  expect(labels).toEqual(['Each day', 'Plan total', 'Daily average'])
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
        { id: 7, attribute_id: 2, min: '120', max: null, applies_to: 'day', must: false, importance: 4, zero_reference: null, ...noAdvanced },
        { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null, ...noAdvanced },
        { id: null, attribute_id: 1, min: '1.5', max: null, applies_to: 'day', must: false, importance: 3, zero_reference: null, ...noAdvanced },
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
    { id: 7, attribute_id: 2, min: '0', max: null, applies_to: 'day', must: true, importance: 4, zero_reference: null, ...noAdvanced },
    { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null, ...noAdvanced },
  ])
  wrapper.unmount()
})

test('Delete removes the goal with one request and closes', async () => {
  const sent = server()
  const wrapper = await mountDialog(protein)
  await dialog().click('Delete')
  expect(sent).toHaveLength(1)
  expect(sent[0]!.goals).toEqual([
    { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null, ...noAdvanced },
  ])
  expect(wrapper.emitted('saved')).toHaveLength(1)
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  wrapper.unmount()
})

test('a refused Delete shows the general error only, not field errors at the next goal’s place', async () => {
  // Without protein, energy is the goal at index 0 of the goals sent.
  server({
    'PUT /api/plan': {
      status: 422,
      body: { detail: [{ loc: ['body', 'goals', 0, 'min'], type: 'min_above_max', msg: 'no' }] },
    },
  })
  const wrapper = await mountDialog(protein)
  await dialog().click('Delete')
  expect(dialog().text).toContain('Could not save. Try again.')
  expect(dialog().text).not.toContain('Must be at most the maximum.')
  expect(wrapper.emitted('saved')).toBeUndefined()
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

test('the name follows the attribute and Applies to, numbered among the goals, until typed in', async () => {
  const sent = server()
  const wrapper = await mountDialog(null)
  await type('Min', '100')
  expect(input('Goal name')!.value).toBe('Energy per day')
  await pickAttribute(wrapper, 2)
  expect(input('Goal name')!.value).toBe('Protein per day (2)') // the first protein goal has it
  await dialog().click('Plan total')
  expect(input('Goal name')!.value).toBe('Protein, plan total')
  await type('Goal name', '  Protein floor ')
  await dialog().click('Each day') // the name stops following once edited
  await pickAttribute(wrapper, 1)
  expect(input('Goal name')!.value).toBe('  Protein floor ')
  await dialog().click('Save')
  expect(sent[0]!.goals[2]).toMatchObject({ custom_name: 'Protein floor' })
  wrapper.unmount()
})

test('clearing the name follows again', async () => {
  const sent = server()
  const named = goal({ ...protein, custom_name: 'Protein floor' })
  const wrapper = await mountDialog(named, [named, energy])
  expect(input('Goal name')!.value).toBe('Protein floor')
  await type('Goal name', '')
  expect(input('Goal name')!.getAttribute('placeholder')).toBe('Protein per day')
  input('Goal name')!.focus()
  input('Goal name')!.blur()
  await new Promise((resolve) => setTimeout(resolve)) // the field tells of a blur after a tick
  await flushPromises()
  expect(input('Goal name')!.value).toBe('Protein per day')
  await dialog().click('Plan total')
  expect(input('Goal name')!.value).toBe('Protein, plan total')
  await dialog().click('Save')
  expect(sent[0]!.goals[0]).toMatchObject({ custom_name: null })
  wrapper.unmount()
})

test('Advanced is collapsed for a new goal and a goal without advanced settings', async () => {
  let wrapper = await mountDialog(null)
  expect(advancedOpen()).toBe(false)
  expect(dialog().text).toContain('Advanced')
  wrapper.unmount()
  wrapper = await mountDialog(energy)
  expect(advancedOpen()).toBe(false)
  wrapper.unmount()
})

test.each([
  ['a typed name', { custom_name: 'Fuel' }],
  ['importance below and above', { applies_to: 'day', must: false, importance_below: 2, importance_above: 4 }],
  ['the guard-rail off', { day_guard_rail: false }],
  ['the guard-rail’s own importance', { guard_rail_importance: 5 }],
] as const)('Advanced is open for a goal with %s', async (_, fields) => {
  const wrapper = await mountDialog(goal({ ...energy, ...fields }))
  expect(advancedOpen()).toBe(true)
  wrapper.unmount()
})

test('importance below and above shows for Prefer with both bounds only, replacing the main slider', async () => {
  const wrapper = await mountDialog(protein)
  await openAdvanced()
  const split = 'Different importance below and above'
  expect(toggle(split)).toBeNull() // no maximum
  await type('Max', '150')
  expect(toggle(split)).not.toBeNull()
  await flip(split)
  expect(slider(wrapper, 'Importance')).toBeUndefined()
  expect(dialog().text).toContain('Set below and above, under Advanced')
  expect(slider(wrapper, 'Below the range')!.props('modelValue')).toBe(4) // starting at the goal's importance
  expect(slider(wrapper, 'Above the range')!.props('modelValue')).toBe(4)
  await dialog().click('Must')
  expect(toggle(split)).toBeNull()
  expect(slider(wrapper, 'Below the range')).toBeUndefined()
  expect(dialog().text).not.toContain('Set below and above')
  await dialog().click('Prefer')
  await flip(split)
  expect(slider(wrapper, 'Importance')!.props('modelValue')).toBe(4)
  expect(slider(wrapper, 'Below the range')).toBeUndefined()
  wrapper.unmount()
})

test('the day guard-rail shows for a daily average only, its importance following the goal until moved', async () => {
  const wrapper = await mountDialog(protein)
  await openAdvanced()
  const guardRail = 'Also keep each day in range'
  const each = 'Importance of each day'
  expect(toggle(guardRail)).toBeNull()
  await dialog().click('Plan total')
  expect(toggle(guardRail)).toBeNull()
  await dialog().click('Daily average')
  expect(toggle(guardRail)!.getAttribute('aria-checked')).toBe('true') // on by default
  expect(slider(wrapper, each)!.props('modelValue')).toBe(3) // one step below Prefer's 4
  await move(wrapper, 'Importance', 2)
  expect(slider(wrapper, each)!.props('modelValue')).toBe(1)
  await dialog().click('Must')
  expect(slider(wrapper, each)!.props('modelValue')).toBe(2) // shown for Must too
  await move(wrapper, each, 5)
  await dialog().click('Prefer')
  expect(slider(wrapper, each)!.props('modelValue')).toBe(5) // once moved, its own
  await flip(guardRail)
  expect(slider(wrapper, each)).toBeUndefined()
  wrapper.unmount()
})

test('Save sends the advanced settings shown', async () => {
  const sent = server()
  const wrapper = await mountDialog(null)
  await type('Min', '1800')
  await type('Max', '2200')
  await openAdvanced()
  await type('Goal name', 'Fuel')
  await flip('Different importance below and above')
  await move(wrapper, 'Below the range', 5)
  await move(wrapper, 'Above the range', 1)
  await dialog().click('Daily average')
  await move(wrapper, 'Importance of each day', 4)
  await dialog().click('Save')
  expect(sent[0]!.goals[2]).toEqual({
    id: null,
    attribute_id: 1,
    min: '1800',
    max: '2200',
    applies_to: 'daily_average',
    must: false,
    importance: 3,
    zero_reference: null,
    custom_name: 'Fuel',
    importance_below: 5,
    importance_above: 1,
    day_guard_rail: true,
    guard_rail_importance: 4,
  })
  wrapper.unmount()
})

test('Save sends the defaults for advanced settings hidden or off', async () => {
  const sent = server()
  const advanced = goal({ ...energy, must: false, importance_below: 5, importance_above: 1, guard_rail_importance: 4 })
  let wrapper = await mountDialog(advanced, [protein, advanced])
  await flip('Also keep each day in range')
  await dialog().click('Save')
  expect(sent[0]!.goals[1]).toMatchObject({ day_guard_rail: false, guard_rail_importance: null })
  wrapper.unmount()

  wrapper = await mountDialog(advanced, [protein, advanced])
  await dialog().click('Each day') // the guard-rail is hidden
  await dialog().click('Must') // the split is hidden
  await dialog().click('Save')
  expect(sent[1]!.goals[1]).toMatchObject({
    importance_below: null,
    importance_above: null,
    day_guard_rail: true,
    guard_rail_importance: null,
  })
  wrapper.unmount()
})

test('the guard-rail’s importance is sent as null while it follows the goal', async () => {
  const sent = server()
  const wrapper = await mountDialog(energy)
  await dialog().click('Save')
  expect(sent[0]!.goals[1]).toMatchObject({ day_guard_rail: true, guard_rail_importance: null })
  wrapper.unmount()
})

test('the server’s errors on the advanced settings show on their fields, the name’s opening Advanced', async () => {
  const refuse = (loc: string, type: string) => ({
    status: 422,
    body: { detail: [{ loc: ['body', 'goals', 2, loc], type, msg: 'no' }] },
  })
  server({ 'PUT /api/plan': refuse('custom_name', 'duplicate') })
  const wrapper = await mountDialog(null)
  await type('Min', '1800')
  await type('Max', '2200')
  await dialog().click('Daily average')
  await dialog().click('Save')
  expect(advancedOpen()).toBe(true)
  expect(dialog().text).toContain('Another goal has this name.')
  expect(dialog().text).not.toContain('Could not save. Try again.')

  fakeServer({ 'PUT /api/plan': refuse('custom_name', 'string_too_long') })
  await dialog().click('Save')
  expect(dialog().text).toContain('At most 100 characters.')

  await flip('Different importance below and above')
  for (const field of ['importance_below', 'importance_above', 'guard_rail_importance']) {
    fakeServer({ 'PUT /api/plan': refuse(field, 'less_than_equal') })
    await dialog().click('Save')
    expect(dialog().text.match(/An importance from 1 to 5./g)).toHaveLength(1)
    expect(dialog().text).not.toContain('Could not save. Try again.')
  }
  fakeServer({ 'PUT /api/plan': refuse('day_guard_rail', 'bool_parsing') })
  await dialog().click('Save')
  expect(dialog().text).toContain('Could not save this setting.')
  wrapper.unmount()
})

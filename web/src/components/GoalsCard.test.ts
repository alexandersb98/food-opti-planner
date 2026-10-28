import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { attribute, goal } from '../test-data'
import GoalsCard from './GoalsCard.vue'

const attributes = [
  attribute({ id: 1, name: 'Energy', unit: 'kcal' }),
  attribute({ id: 2, name: 'Protein', unit: 'g' }),
]

function mountCard(props: InstanceType<typeof GoalsCard>['$props']) {
  return mount(GoalsCard, { props, global: { plugins: [Quasar, makeI18n()] } })
}

test('a row per goal shows the attribute, range, scope and chip, with importance as dots', () => {
  const wrapper = mountCard({
    attributes,
    goals: [
      goal({ id: 1, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true }),
      goal({ id: 2, attribute_id: 2, min: '120', max: null, importance: 4 }),
    ],
  })
  const rows = wrapper.findAll('.goal-row')
  expect(rows).toHaveLength(2)
  expect(rows[0]!.text()).toMatch(/^Energy\s*1800–2200 kcal\s*Whole plan · daily average\s*Must$/)
  expect(rows[0]!.findAll('.importance-dot')).toHaveLength(0)
  expect(rows[1]!.text()).toMatch(/^Protein\s*at least 120 g\s*Each day\s*Prefer$/)
  const dots = rows[1]!.findAll('.importance-dot').map((dot) => dot.classes('filled'))
  expect(dots).toEqual([true, true, true, true, false])
  expect(rows[1]!.get('.importance').attributes('aria-label')).toBe('Importance 4 of 5')
})

test('a row emits edit with its goal, and + Add goal emits add', async () => {
  const first = goal({ id: 1, attribute_id: 1 })
  const wrapper = mountCard({ attributes, goals: [first] })
  await wrapper.get('.goal-row').trigger('click')
  expect(wrapper.emitted('edit')).toEqual([[first]])
  await wrapper.get('.add-goal').trigger('click')
  expect(wrapper.emitted('add')).toHaveLength(1)
})

test('without attributes, + Add goal is disabled and says to add an attribute first', () => {
  const wrapper = mountCard({ attributes: [], goals: [] })
  expect(wrapper.get('.add-goal').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Add an attribute first')
  const enabled = mountCard({ attributes, goals: [] })
  expect(enabled.get('.add-goal').attributes('disabled')).toBeUndefined()
  expect(enabled.text()).not.toContain('Add an attribute first')
})

test('a typed name is the row’s title, with the attribute before the range', () => {
  const wrapper = mountCard({
    attributes,
    goals: [goal({ id: 1, attribute_id: 2, min: '120', max: null, custom_name: 'Protein floor', name: 'Protein floor' })],
  })
  expect(wrapper.get('.goal-row').text()).toMatch(/^Protein floor\s*Protein · at least 120 g\s*Each day\s*Prefer$/)
})

test('a goal with importance below and above shows both as dots, below / above', () => {
  const wrapper = mountCard({
    attributes,
    goals: [goal({ id: 1, attribute_id: 1, min: '1800', max: '2200', importance_below: 2, importance_above: 4 })],
  })
  const row = wrapper.get('.goal-row')
  const groups = row.findAll('.importance').map((group) => group.findAll('.importance-dot').map((dot) => dot.classes('filled')))
  expect(groups).toEqual([
    [true, true, false, false, false],
    [true, true, true, true, false],
  ])
  expect(row.get('.goal-chip').text()).toMatch(/^Prefer\s*\/$/)
  expect(row.get('.importance-split').attributes('aria-label')).toBe('Importance 2 of 5 below the range, 4 of 5 above')
})

test('a goal in the clash is marked red with an error icon', () => {
  const wrapper = mountCard({
    attributes,
    goals: [goal({ id: 1, attribute_id: 1 }), goal({ id: 2, attribute_id: 2, must: true })],
    clashing: [2],
  })
  const rows = wrapper.findAll('.goal-row')
  expect(rows.map((row) => row.classes('clashing'))).toEqual([false, true])
  expect(rows[1]!.get('.text-negative').text()).toBe('errorProtein')
  expect(rows[0]!.find('.text-negative').exists()).toBe(false)
})

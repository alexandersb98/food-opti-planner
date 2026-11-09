import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { defineComponent, h, provide } from 'vue'
import { afterEach, expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { importReviewKey, type ImportReview } from '../importReview'
import { ingredient } from '../test-data'
import type { DraftLine, DraftSection } from '../composables/useRecipeDraft'
import RecipeSection from './RecipeSection.vue'

const oats = ingredient({ id: 1, name: 'Oats' })
const milk = ingredient({ id: 2, name: 'Milk', unit: 'ml' })
const ingredients = new Map([oats, milk].map((i) => [i.id, i]))

/** A plain line, as a recipe typed by hand has it. */
function line(key: number, ingredientId: number, amount: string, unit: string): DraftLine {
  return { key, ingredientId, amount, unit, originalText: '', food: '', skipped: false, notAnIngredient: false, suggestedFactor: null }
}

function section(name = ''): DraftSection {
  return {
    key: 1,
    name,
    items: [
      line(11, 1, '60', ''),
      line(12, 2, '200', ''),
    ],
  }
}

function mountSection(props: Partial<InstanceType<typeof RecipeSection>['$props']> & { section?: DraftSection } = {}) {
  const draft = props.section ?? section()
  const wrapper = mount(RecipeSection, {
    attachTo: document.body,
    props: {
      section: draft,
      index: 0,
      count: 1,
      ingredients,
      errors: { name: '', amounts: {} },
      others: [],
      ...props,
    },
    global: { plugins: [Quasar, makeI18n()] },
  })
  return { wrapper, draft }
}

afterEach(() => {
  document.body.innerHTML = ''
})

test('one unnamed section shows no name field, no remove button and no line menu', () => {
  const { wrapper } = mountSection()
  expect(wrapper.find('.section-name').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Remove section')
  expect(wrapper.find('[aria-label="Line menu for Oats"]').exists()).toBe(false)
  expect(wrapper.findAll('.recipe-item')).toHaveLength(2)
  wrapper.unmount()
})

test('a name, or more than one section, shows the name field and Remove section', async () => {
  const { wrapper } = mountSection({ section: section('Base') })
  expect(wrapper.get<HTMLInputElement>('.section-name input').element.value).toBe('Base')
  await wrapper.setProps({ section: section(''), count: 2 })
  expect(wrapper.find('.section-name').exists()).toBe(true)
  await wrapper.findAll('button').find((b) => b.text() === 'Remove section')!.trigger('click')
  expect(wrapper.emitted('removeSection')).toHaveLength(1)
  wrapper.unmount()
})

test('the line menu lists the other sections and emits move', async () => {
  const { wrapper } = mountSection({
    count: 3,
    others: [
      { index: 1, label: 'Topping' },
      { index: 2, label: 'Section 3' },
    ],
  })
  await wrapper.get('[aria-label="Line menu for Milk"]').trigger('click')
  await new Promise((resolve) => setTimeout(resolve, 0))
  const entries = [...document.querySelectorAll<HTMLElement>('.q-menu .move-to')]
  expect(entries.map((e) => e.textContent?.trim())).toEqual(['Move to Topping', 'Move to Section 3'])
  entries[1]!.click()
  expect(wrapper.emitted('move')).toEqual([[1, 2]])
  wrapper.unmount()
})

test('the amount input edits the draft line, and the buttons emit add and removeLine', async () => {
  const { wrapper, draft } = mountSection()
  await wrapper.get('input[aria-label="Amount of Oats"]').setValue('75')
  expect(draft.items[0]!.amount).toBe('75')
  expect(wrapper.text()).toContain('ml')
  await wrapper.get('[aria-label="Remove Milk"]').trigger('click')
  expect(wrapper.emitted('removeLine')).toEqual([[1]])
  await wrapper.findAll('button').find((b) => b.text() === '+ Add ingredient')!.trigger('click')
  expect(wrapper.emitted('add')).toHaveLength(1)
  wrapper.unmount()
})

test('the name field edits the section name', async () => {
  const { wrapper, draft } = mountSection({ section: section('Base'), count: 2 })
  await wrapper.get('.section-name input').setValue('Topping')
  expect(draft.name).toBe('Topping')
  wrapper.unmount()
})

test('a name error and an amount error show on their fields', () => {
  const { wrapper } = mountSection({
    section: section('Base'),
    count: 2,
    errors: { name: 'Name every section.', amounts: { 12: 'Enter an amount above 0.' } },
  })
  expect(wrapper.get('.section-name').text()).toContain('Name every section.')
  const rows = wrapper.findAll('.recipe-item')
  expect(rows[0]!.text()).not.toContain('Enter an amount')
  expect(rows[1]!.text()).toContain('Enter an amount above 0.')
  wrapper.unmount()
})

test('every line has a unit picker, and a change edits the draft line', async () => {
  const { wrapper, draft } = mountSection()
  const pickers = wrapper.findAll('.line-unit')
  expect(pickers).toHaveLength(2)
  expect(wrapper.find('[aria-label="Unit of Oats"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="Unit of Milk"]').exists()).toBe(true)
  const picker = wrapper.findComponent({ name: 'LineUnitPicker' })
  picker.vm.$emit('update:modelValue', 'kg')
  await wrapper.vm.$nextTick()
  expect(draft.items[0]!.unit).toBe('kg')
  wrapper.unmount()
})

test("New unit… on a line is passed up with the line's place", async () => {
  const { wrapper } = mountSection()
  const pickers = wrapper.findAllComponents({ name: 'LineUnitPicker' })
  pickers[1]!.vm.$emit('new-unit')
  expect(wrapper.emitted('newUnit')).toEqual([[1]])
  wrapper.unmount()
})

test('a unit error shows under its line only', () => {
  const { wrapper } = mountSection({
    errors: { name: '', amounts: {}, units: { 12: true } },
    section: { ...section(), items: [line(11, 1, '60', ''), line(12, 2, '1', 'dl')] },
  })
  const rows = wrapper.findAll('.recipe-item')
  expect(rows[0]!.text()).not.toContain("doesn't convert")
  expect(rows[1]!.text()).toContain("dl of Milk doesn't convert. Pick another unit or add a conversion.")
  wrapper.unmount()
})

// the import review -------------------------------------------------------------

function mountReview(skippedKeys: number[] = [], unmatchedKeys: number[] = []) {
  const calls: string[] = []
  const review: ImportReview = {
    state: (line) => (skippedKeys.includes(line.key) ? 'skipped' : unmatchedKeys.includes(line.key) ? 'unmatched' : 'ready'),
    factor: () => null,
    pick: (s, l) => calls.push(`pick ${s} ${l}`),
    skip: (s, l) => calls.push(`skip ${s} ${l}`),
    unskip: (s, l) => calls.push(`unskip ${s} ${l}`),
    accept: () => {},
    change: () => {},
    factorInput: () => {},
  }
  const draft = section()
  const Host = defineComponent({
    setup() {
      provide(importReviewKey, review)
      return () =>
        h(RecipeSection, { section: draft, index: 0, count: 1, ingredients, errors: { name: '', amounts: {} }, others: [] })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [Quasar, makeI18n()] } })
  return { wrapper, calls }
}

test('without the injected review nothing of the review renders', () => {
  const { wrapper } = mountSection()
  expect(wrapper.find('.review-line').exists()).toBe(false)
  expect(wrapper.find('.source-line').exists()).toBe(false)
  wrapper.unmount()
})

test('in review a line is wrapped by its review, and a skipped line has its amount disabled', async () => {
  const { wrapper } = mountReview([12])
  const rows = wrapper.findAll('.recipe-item')
  expect(rows).toHaveLength(2)
  expect(rows.every((r) => r.classes().includes('review-line'))).toBe(true)
  expect(rows[0]!.get('input').attributes('disabled')).toBeUndefined()
  expect(rows[1]!.get('input').attributes('disabled')).toBeDefined()
  expect(rows[1]!.classes()).toContain('line-skipped')
  wrapper.unmount()
})

test('the buttons of a review line say which section and line asked', async () => {
  const { wrapper, calls } = mountReview([], [12])
  await wrapper.get('.pick-ingredient').trigger('click')
  await wrapper.get('.skip').trigger('click')
  expect(calls).toEqual(['pick 0 1', 'skip 0 1'])
  wrapper.unmount()
})

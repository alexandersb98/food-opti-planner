import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { afterEach, expect, test } from 'vitest'
import type { DraftLine } from '../composables/useRecipeDraft'
import { makeI18n } from '../i18n'
import type { FactorRow, LineState } from '../importReview'
import { ingredient } from '../test-data'
import ImportLineReview from './ImportLineReview.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    key: 1,
    ingredientId: 2,
    amount: '3',
    unit: 'dl',
    originalText: '3 dl milk',
    food: 'milk',
    skipped: false,
    notAnIngredient: false,
    suggestedFactor: null,
    ...over,
  }
}

const row = (over: Partial<FactorRow> = {}): FactorRow => ({ text: '50', ai: true, loading: false, accepted: false, ...over })

function mountReview(state: LineState, over: Partial<DraftLine> = {}, factor: FactorRow | null = null) {
  const wrapper = mount(ImportLineReview, {
    props: { line: line(over), ingredient: ingredient({ id: 2, name: 'Milk' }), state, ownUnit: 'g', factor },
    slots: { default: '<div class="the-row">row</div>' },
    global: { plugins: [Quasar, makeI18n()] },
    attachTo: document.body,
  })
  return wrapper
}

const buttons = (wrapper: ReturnType<typeof mountReview>) => wrapper.findAll('button').map((b) => b.text())

test('the source line is shown above the row, and not when empty', () => {
  const wrapper = mountReview('ready')
  expect(wrapper.get('.source-line').text()).toBe('3 dl milk')
  expect(wrapper.html().indexOf('source-line')).toBeLessThan(wrapper.html().indexOf('the-row'))
  expect(buttons(wrapper)).toEqual([])
  expect(wrapper.classes()).not.toContain('needs-you')
  expect(mountReview('ready', { originalText: '' }).find('.source-line').exists()).toBe(false)
})

test('an unmatched line has Pick ingredient and Skip, and emits them', async () => {
  const wrapper = mountReview('unmatched', { ingredientId: null })
  expect(buttons(wrapper)).toEqual(['Pick ingredient', 'Skip'])
  expect(wrapper.classes()).toContain('needs-you')
  await wrapper.get('.pick-ingredient').trigger('click')
  await wrapper.get('.skip').trigger('click')
  expect(wrapper.emitted('pick')).toHaveLength(1)
  expect(wrapper.emitted('skip')).toHaveLength(1)
})

test('a line that needs a factor shows 1 dl = [50] g with the sparkle and its tooltip', async () => {
  const wrapper = mountReview('needs_factor', {}, row())
  expect(wrapper.get('.factor-row').text()).toContain('1 dl =')
  expect(wrapper.get<HTMLInputElement>('input[aria-label="How many g one dl makes"]').element.value).toBe('50')
  expect(wrapper.get('.ai-mark').text()).toContain('✨')
  expect(buttons(wrapper)).toEqual(['Accept', 'Skip'])
  await wrapper.get('.accept-factor').trigger('click')
  expect(wrapper.emitted('accept')).toEqual([['50']])
})

test('typing is emitted, and without the AI number there is no sparkle', async () => {
  const wrapper = mountReview('needs_factor', {}, row({ text: '', ai: false }))
  expect(wrapper.find('.ai-mark').exists()).toBe(false)
  await wrapper.get('input').setValue('45')
  expect(wrapper.emitted('factor-input')).toEqual([['45']])
})

test('Accept is disabled for an invalid number', () => {
  for (const text of ['', '0', 'abc', '0.1234567']) {
    const wrapper = mountReview('needs_factor', {}, row({ text, ai: false }))
    expect(wrapper.get('.accept-factor').attributes('disabled'), text).toBeDefined()
  }
})

test('while a suggestion is on its way the box says Suggesting', () => {
  const wrapper = mountReview('needs_factor', {}, row({ text: '', ai: false, loading: true }))
  expect(wrapper.get('input').attributes('placeholder')).toBe('Suggesting…')
  expect(wrapper.get('.accept-factor').attributes('disabled')).toBeDefined()
})

test('an accepted factor reads as a summary with Change', async () => {
  const wrapper = mountReview('ready', {}, row({ text: '100', accepted: true }))
  const summary = wrapper.get('.factor-row').text()
  expect(summary).toContain('1 dl =')
  expect(summary).toContain('100 g')
  expect(summary).toContain('✨')
  expect(wrapper.find('input').exists()).toBe(false)
  expect(buttons(wrapper)).toEqual(['Change'])
  await wrapper.get('.change-factor').trigger('click')
  expect(wrapper.emitted('change')).toHaveLength(1)
  expect(wrapper.classes()).not.toContain('needs-you')
})

test('a changed-by-hand accepted factor has no sparkle', () => {
  const wrapper = mountReview('ready', {}, row({ text: '90', ai: false, accepted: true }))
  expect(wrapper.find('.ai-mark').exists()).toBe(false)
})

test('a bad unit shows the message and Skip', () => {
  const wrapper = mountReview('bad_unit', { unit: 'kcal' })
  expect(wrapper.get('.bad-unit').text()).toBe("kcal can't be used for an ingredient. Pick another unit.")
  expect(buttons(wrapper)).toEqual(['Skip'])
  expect(wrapper.classes()).toContain('needs-you')
})

test('a skipped line is greyed, with Add anyway when it was not an ingredient and Add back when the user skipped it', async () => {
  const anyway = mountReview('skipped', { skipped: true, notAnIngredient: true })
  expect(anyway.classes()).toContain('line-skipped')
  expect(buttons(anyway)).toEqual(['Add anyway'])
  await anyway.get('.unskip').trigger('click')
  expect(anyway.emitted('unskip')).toHaveLength(1)
  const back = mountReview('skipped', { skipped: true })
  expect(buttons(back)).toEqual(['Add back'])
  expect(back.classes()).not.toContain('needs-you')
})

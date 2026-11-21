import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { makeI18n } from '../i18n'
import type { DraftLine, RecipeDraft } from '../recipeDraft'
import { fakeServer } from '../test-app'
import { importedLine, importedRecipe, ingredient, lines, recipe } from '../test-data'
import { useRecipeDraft } from './useRecipeDraft'

let lineKey = 100
function line(ingredientId: number, amount: string, originalText = '', unit = ''): DraftLine {
  return { key: ++lineKey, ingredientId, amount, unit, originalText, food: '', skipped: false, notAnIngredient: false, suggestedFactor: null }
}

/** A draft of named sections, each a list of (ingredient id, amount) lines. */
function sectioned(...sections: [string, [number, string][]][]): RecipeDraft['sections'] {
  return sections.map(([name, items], i) => ({ key: 200 + i, name, items: items.map(([id, amount]) => line(id, amount)) }))
}

// The composable: sections and lines.

const oats = ingredient({ id: 1, name: 'Oats' })
const milk = ingredient({ id: 2, name: 'Milk' })

function mounted(id: number | null = null) {
  let draft!: ReturnType<typeof useRecipeDraft>
  const Host = defineComponent({
    setup() {
      draft = useRecipeDraft(id)
      return () => h('div')
    },
  })
  const wrapper = mount(Host, { global: { plugins: [makeI18n()] } })
  return { wrapper, draft }
}

afterEach(() => vi.unstubAllGlobals())

function shape(draft: RecipeDraft) {
  return draft.sections.map((section) => [section.name, section.items.map((i) => i.ingredientId)])
}

test('lines are added to the section asked, removed and moved, and none is lost', async () => {
  fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted()
  draft.addSection()
  draft.addIngredient(0, oats)
  draft.addIngredient(1, milk)
  draft.addIngredient(1, oats)
  expect(shape(draft.draft)).toEqual([['', [1]], ['', [2, 1]]])
  expect(draft.lineCount.value).toBe(3)
  draft.moveLine(1, 0, 0)
  expect(shape(draft.draft)).toEqual([['', [1, 2]], ['', [1]]])
  draft.removeLine(1, 0)
  expect(draft.lineCount.value).toBe(2)
  wrapper.unmount()
})

test('removing a section moves its lines to the section above, or below for the first', () => {
  const { wrapper, draft } = mounted()
  draft.draft.sections = sectioned(['A', [[1, '1']]], ['B', [[2, '1']]], ['C', [[1, '2'], [2, '2']]])
  const before = draft.lineCount.value
  draft.removeSection(1)
  expect(shape(draft.draft)).toEqual([['A', [1, 2]], ['C', [1, 2]]])
  draft.removeSection(0)
  expect(shape(draft.draft)).toEqual([['C', [1, 2, 1, 2]]])
  expect(draft.lineCount.value).toBe(before)
  draft.removeSection(0) // the only section stays
  expect(draft.draft.sections).toHaveLength(1)
  wrapper.unmount()
})

test('the servings number is the typed one while valid, else 1', () => {
  const { wrapper, draft } = mounted()
  draft.draft.servings = '4'
  expect(draft.servingsNumber.value).toBe(4)
  draft.draft.servings = 'x'
  expect(draft.servingsNumber.value).toBe(1)
  draft.draft.servings = '0'
  expect(draft.servingsNumber.value).toBe(1)
  wrapper.unmount()
})

test('the derived tags are asked once for an ingredient on two lines', async () => {
  const calls = fakeServer({ 'POST /api/recipes/derived-tags': { body: [1] } })
  const { wrapper, draft } = mounted()
  draft.addIngredient(0, oats)
  await flushPromises()
  draft.addSection()
  draft.addIngredient(1, oats)
  await flushPromises()
  expect(calls.filter((call) => call === 'POST /api/recipes/derived-tags')).toHaveLength(1)
  expect(draft.derivedTagIds.value).toEqual([1])
  wrapper.unmount()
})

test('a recipe opened is not asked about, though its lines are in sections', async () => {
  const calls = fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted(7)
  draft.fillDraft(
    recipe({ id: 7, name: 'Porridge', sections: lines([2, '1'], [1, '2'], [2, '3']), derived_tag_ids: [5] }),
  )
  await flushPromises()
  expect(calls).toEqual([])
  expect(draft.derivedTagIds.value).toEqual([5])
  wrapper.unmount()
})

test('a line added starts in the ingredient\'s own unit', () => {
  const { wrapper, draft: drafted } = mounted()
  drafted.addIngredient(0, oats)
  expect(drafted.draft.sections[0]!.items[0]!.unit).toBe('')
  wrapper.unmount()
})

// the import review -----------------------------------------------------------

function imported() {
  return importedRecipe({
    cut: true,
    sections: [
      {
        name: '',
        lines: [
          importedLine({ original_text: '100 g oats', ingredient_id: 1, status: 'own_unit' }),
          importedLine({ original_text: '3 dl milk', food: 'milk', amount: '3', unit: 'dl', ingredient_id: 2, status: 'needs_factor', suggested_factor: '50' }),
          importedLine({ original_text: 'salt to taste', food: 'salt', amount: null, status: 'not_an_ingredient' }),
        ],
      },
    ],
  })
}

test('fillImported fills the draft of the composable', () => {
  fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted()
  draft.fillImported(imported())
  expect(draft.draft.name).toBe('Imported porridge')
  expect(draft.draft.imported).toEqual({ cut: true, site: '' })
  wrapper.unmount()
})

test('acceptFactor replaces a pending conversion of the same key; forgetFactor removes it', () => {
  const { wrapper, draft } = mounted()
  draft.acceptFactor(2, 'dl', '50', '50')
  draft.acceptFactor(2, 'DL', '60', '50')
  expect(draft.draft.pending).toEqual([{ ingredientId: 2, unit: 'DL', factor: '60', source: 'user' }])
  draft.forgetFactor(2, 'dl')
  expect(draft.draft.pending).toEqual([])
  wrapper.unmount()
})

test('skipLine and unskipLine toggle a line; setLineIngredient keeps amount and unit', () => {
  fakeServer({ 'POST /api/recipes/derived-tags': { body: [] } })
  const { wrapper, draft } = mounted()
  draft.fillImported(imported())
  draft.skipLine(0, 0)
  expect(draft.draft.sections[0]!.items[0]!.skipped).toBe(true)
  draft.unskipLine(0, 0)
  expect(draft.draft.sections[0]!.items[0]!.skipped).toBe(false)
  draft.setLineIngredient(0, 2, oats)
  expect(draft.draft.sections[0]!.items[2]).toMatchObject({ ingredientId: oats.id, amount: '', unit: '' })
  draft.setLineIngredient(0, 1, oats)
  expect(draft.draft.sections[0]!.items[1]).toMatchObject({ ingredientId: oats.id, amount: '3', unit: 'dl' })
  wrapper.unmount()
})

test('the derived-tags question ignores skipped and unmatched lines', async () => {
  const asked: unknown[] = []
  fakeServer({
    'POST /api/recipes/derived-tags': (body) => {
      asked.push(body)
      return { body: [] }
    },
  })
  const { wrapper, draft } = mounted()
  draft.fillImported(imported())
  draft.skipLine(0, 0)
  await flushPromises()
  expect(asked).toEqual([{ ingredient_ids: [2] }])
  wrapper.unmount()
})

import { afterEach, expect, test } from 'vitest'
import { importedRecipe } from '../../test-data'
import { importDraftStore } from './importDraft'

// A port of the Vue hand-over tests (src/importDraft.test.ts) to the neutral store.

afterEach(() => importDraftStore.reset())

test('a draft is taken once and then it is gone', () => {
  const recipe = importedRecipe({ name: 'Soup' })
  importDraftStore.put(recipe)
  expect(importDraftStore.getSnapshot()).toBe(recipe)
  expect(importDraftStore.take()).toBe(recipe)
  expect(importDraftStore.take()).toBeNull()
})

test('putting null clears an old draft', () => {
  importDraftStore.put(importedRecipe())
  importDraftStore.put(null)
  expect(importDraftStore.take()).toBeNull()
})

test('a reset clears the draft', () => {
  importDraftStore.put(importedRecipe())
  importDraftStore.reset()
  expect(importDraftStore.take()).toBeNull()
})

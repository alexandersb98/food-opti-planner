import { expect, test } from 'vitest'
import { setImportedDraft, takeImportedDraft } from './importDraft'
import { importedRecipe } from './test-data'

test('a draft is taken once and then it is gone', () => {
  const recipe = importedRecipe({ name: 'Soup' })
  setImportedDraft(recipe)
  expect(takeImportedDraft()).toBe(recipe)
  expect(takeImportedDraft()).toBeNull()
})

test('setting null clears an old draft', () => {
  setImportedDraft(importedRecipe())
  setImportedDraft(null)
  expect(takeImportedDraft()).toBeNull()
})

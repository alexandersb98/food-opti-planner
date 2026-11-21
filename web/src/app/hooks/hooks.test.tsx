import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { importedRecipe, preferences, unitCatalogue } from '../../test-data'
import { importDraftStore } from '../stores/importDraft'
import { preferencesStore } from '../stores/preferences'
import { unitsStore } from '../stores/units'
import { fakeServer } from '../test-app'
import { useImportedDraft } from './useImportedDraft'
import { usePreferences } from './usePreferences'
import { useRecipeCount } from './useRecipeCount'
import { useUnits } from './useUnits'

// The React hooks over the neutral stores: thin, so only what they add
// (loading on first use, re-rendering on change, taking the draft once).

afterEach(() => {
  unitsStore.reset()
  preferencesStore.reset()
  importDraftStore.reset()
  vi.unstubAllGlobals()
})

test('two readers of the units load the catalogue once and both see it', async () => {
  const calls = fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  const one = renderHook(() => useUnits())
  const other = renderHook(() => useUnits())
  await waitFor(() => expect(one.result.current.units).toHaveLength(33))
  expect(other.result.current.findUnit('gram')?.symbol).toBe('g')
  expect(calls).toEqual(['GET /api/units'])
})

test('a reader of the preferences sees a save', async () => {
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': { body: preferences({ 'unit.mass': 'kg' }) },
  })
  const { result } = renderHook(() => usePreferences())
  await waitFor(() => expect(result.current.preferences).toEqual(preferences()))
  await act(() => result.current.set('unit.mass', 'kg'))
  expect(result.current.preferences?.['unit.mass']).toBe('kg')
})

test('the imported draft is taken once, also when StrictMode renders twice', () => {
  const recipe = importedRecipe({ name: 'Soup' })
  importDraftStore.put(recipe)
  const { result } = renderHook(() => useImportedDraft(), { wrapper: StrictMode })
  expect(result.current).toBe(recipe)
  expect(importDraftStore.getSnapshot()).toBeNull()
  expect(renderHook(() => useImportedDraft()).result.current).toBeNull()
})

test('the recipe count re-renders with each answer', async () => {
  fakeServer({ 'POST /api/plan/recipe-count': { body: { usable: 4, total: 10 } } })
  const { result } = renderHook(() => useRecipeCount())
  expect(result.current.count).toBeNull()
  await act(() => result.current.ask([]))
  expect(result.current).toMatchObject({ count: { usable: 4, total: 10 }, failed: false })
})

import { afterEach, expect, test, vi } from 'vitest'
import type { RecipeCount } from '../../api/types'
import { fakeServer, type FakeReply } from '../test-app'
import { createRecipeCount } from './recipeCount'

// A port of the Vue recipe count tests (src/recipeCount.test.ts) to the
// neutral store.

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A server whose count answers wait until the test releases them. */
function heldServer() {
  const held: { body: unknown; answer: (reply: FakeReply) => void }[] = []
  fakeServer({
    'POST /api/plan/recipe-count': (body) => new Promise((answer) => held.push({ body, answer })),
  })
  return held
}

function counted(usable: number): FakeReply {
  return { body: { usable, total: 10 } satisfies RecipeCount }
}

test('the count is asked for the filters and answered', async () => {
  const held = heldServer()
  const store = createRecipeCount()
  expect(store.getSnapshot()).toEqual({ count: null, failed: false })
  const asked = store.ask([{ tag_id: 2, mode: 'only' }])
  await vi.waitFor(() => expect(held).toHaveLength(1))
  expect(held[0]!.body).toEqual({ tag_filters: [{ tag_id: 2, mode: 'only' }] })
  held[0]!.answer(counted(4))
  await asked
  expect(store.getSnapshot()).toEqual({ count: { usable: 4, total: 10 }, failed: false })
})

test('answers in order replace each other, and the count stays while asking', async () => {
  const held = heldServer()
  const store = createRecipeCount()
  const first = store.ask([])
  await vi.waitFor(() => expect(held).toHaveLength(1))
  held[0]!.answer(counted(10))
  await first
  const second = store.ask([{ tag_id: 1, mode: 'never' }])
  await vi.waitFor(() => expect(held).toHaveLength(2))
  expect(store.getSnapshot().count).toEqual({ usable: 10, total: 10 })
  held[1]!.answer(counted(7))
  await second
  expect(store.getSnapshot().count).toEqual({ usable: 7, total: 10 })
})

test('an answer arriving after a later question is dropped', async () => {
  const held = heldServer()
  const store = createRecipeCount()
  const first = store.ask([{ tag_id: 1, mode: 'only' }])
  const second = store.ask([{ tag_id: 1, mode: 'never' }])
  await vi.waitFor(() => expect(held).toHaveLength(2))
  held[1]!.answer(counted(3))
  await second
  held[0]!.answer(counted(8))
  await first
  expect(store.getSnapshot().count).toEqual({ usable: 3, total: 10 })
})

test('a failed count sets failed, and a later answer clears it', async () => {
  const replies: FakeReply[] = [500, counted(5)]
  fakeServer({ 'POST /api/plan/recipe-count': () => replies.shift()! })
  const store = createRecipeCount()
  await store.ask([])
  expect(store.getSnapshot()).toEqual({ count: null, failed: true })
  await store.ask([])
  expect(store.getSnapshot()).toEqual({ count: { usable: 5, total: 10 }, failed: false })
})

test('a server that cannot be reached sets failed', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  const store = createRecipeCount()
  await store.ask([])
  expect(store.getSnapshot().failed).toBe(true)
})

test('two counts are independent', async () => {
  fakeServer({ 'POST /api/plan/recipe-count': counted(2) })
  const one = createRecipeCount()
  const other = createRecipeCount()
  await one.ask([])
  expect(other.getSnapshot().count).toBeNull()
})

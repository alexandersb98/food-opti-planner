import { afterEach, expect, test, vi } from 'vitest'
import type { RecipeCount } from './api/types'
import { useRecipeCount } from './recipeCount'
import { fakeServer, type FakeReply } from './test-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A server whose count answers wait until the test releases them, each
 * with the usable count it was asked for in `tag_filters.length`. */
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
  const { count, failed, ask } = useRecipeCount()
  expect(count.value).toBeNull()
  const asked = ask([{ tag_id: 2, mode: 'only' }])
  await vi.waitFor(() => expect(held).toHaveLength(1))
  expect(held[0]!.body).toEqual({ tag_filters: [{ tag_id: 2, mode: 'only' }] })
  held[0]!.answer(counted(4))
  await asked
  expect(count.value).toEqual({ usable: 4, total: 10 })
  expect(failed.value).toBe(false)
})

test('answers in order replace each other, and the count stays while asking', async () => {
  const held = heldServer()
  const { count, ask } = useRecipeCount()
  const first = ask([])
  await vi.waitFor(() => expect(held).toHaveLength(1))
  held[0]!.answer(counted(10))
  await first
  const second = ask([{ tag_id: 1, mode: 'never' }])
  await vi.waitFor(() => expect(held).toHaveLength(2))
  expect(count.value).toEqual({ usable: 10, total: 10 })
  held[1]!.answer(counted(7))
  await second
  expect(count.value).toEqual({ usable: 7, total: 10 })
})

test('an answer arriving after a later question is dropped', async () => {
  const held = heldServer()
  const { count, ask } = useRecipeCount()
  const first = ask([{ tag_id: 1, mode: 'only' }])
  const second = ask([{ tag_id: 1, mode: 'never' }])
  await vi.waitFor(() => expect(held).toHaveLength(2))
  held[1]!.answer(counted(3))
  await second
  held[0]!.answer(counted(8))
  await first
  expect(count.value).toEqual({ usable: 3, total: 10 })
})

test('a failed count sets failed, and a later answer clears it', async () => {
  const replies: FakeReply[] = [500, counted(5)]
  fakeServer({ 'POST /api/plan/recipe-count': () => replies.shift()! })
  const { count, failed, ask } = useRecipeCount()
  await ask([])
  expect(failed.value).toBe(true)
  expect(count.value).toBeNull()
  await ask([])
  expect(failed.value).toBe(false)
  expect(count.value).toEqual({ usable: 5, total: 10 })
})

test('a server that cannot be reached sets failed', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  const { failed, ask } = useRecipeCount()
  await ask([])
  expect(failed.value).toBe(true)
})

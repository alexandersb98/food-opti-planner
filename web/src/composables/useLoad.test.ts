import { expect, test } from 'vitest'
import { loadAll } from './useLoad'

test("loadAll gives every call's data by name", async () => {
  const result = await loadAll({ a: Promise.resolve({ data: [1] }), b: Promise.resolve({ data: null }) })
  expect(result).toEqual({ data: { a: [1], b: null } })
})

test('loadAll gives no data if any call failed', async () => {
  const failed = Promise.resolve({ data: undefined, error: 'x' })
  const result = await loadAll({ a: Promise.resolve({ data: [1] }), b: failed })
  expect(result).toEqual({})
})

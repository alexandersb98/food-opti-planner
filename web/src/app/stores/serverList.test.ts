import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../api/client'
import { attribute, tag } from '../../test-data'
import { fakeServer } from '../../test-server'
import { createServerList } from './serverList'
import { attributesList, ingredientsList, resetSharedLists, tagsList } from './sharedLists'

// A shared list: held after the first load, given at once with a refresh in
// the background, and waited for again after an invalidation. Then which
// writes invalidate which of the app's lists.

afterEach(() => {
  resetSharedLists()
  vi.unstubAllGlobals()
})

/** A list whose fetches answer the given lists in turn (undefined: the
 * server refused). */
function counting(answers: (string[] | undefined)[]) {
  let calls = 0
  const list = createServerList<string>(async () => answers[calls++])
  return { list, calls: () => calls }
}

test('the first load waits for the server; the next answers at once and refreshes', async () => {
  const { list, calls } = counting([['a'], ['a', 'b']])
  expect(await list.loadCall()).toEqual({ data: ['a'] })
  const again = await list.loadCall()
  expect(again.data).toEqual(['a'])
  const refresh = await again.refreshed
  expect(refresh?.(['ignored'])).toEqual(['a', 'b'])
  expect(list.getSnapshot().items).toEqual(['a', 'b'])
  expect(calls()).toBe(2)
})

test('a refresh that finds the same list changes nothing', async () => {
  const { list } = counting([['a'], ['a']])
  await list.loadCall()
  const held = list.getSnapshot().items
  expect(await (await list.loadCall()).refreshed).toBeUndefined()
  expect(list.getSnapshot().items).toBe(held)
})

test('after an invalidation the next load waits for the server', async () => {
  const { list, calls } = counting([['a'], ['b']])
  await list.loadCall()
  list.invalidate()
  const after = await list.loadCall()
  expect(after).toEqual({ data: ['b'] })
  expect(after.refreshed).toBeUndefined()
  expect(calls()).toBe(2)
})

test('a refresh in flight at an invalidation gives nothing', async () => {
  let release: (items: string[]) => void = () => {}
  let calls = 0
  const list = createServerList<string>(() =>
    calls++ === 0 ? Promise.resolve(['a']) : new Promise((resolve) => (release = resolve)),
  )
  await list.loadCall()
  const { refreshed } = await list.loadCall()
  list.invalidate()
  release(['stale'])
  expect(await refreshed).toBeUndefined()
  expect(list.getSnapshot().items).toEqual(['a'])
})

test('a first load dropped by an invalidation is asked again', async () => {
  let calls = 0
  let release: (items: string[]) => void = () => {}
  const list = createServerList<string>(() =>
    calls++ === 0 ? new Promise((resolve) => (release = resolve)) : Promise.resolve(['fresh']),
  )
  const loading = list.loadCall()
  list.invalidate()
  release(['stale'])
  expect(await loading).toEqual({ data: ['fresh'] })
  expect(calls).toBe(2)
})

test('a refused load gives no data, and the next load asks again', async () => {
  const { list, calls } = counting([undefined, ['a']])
  expect(await list.loadCall()).toEqual({})
  expect(calls()).toBe(1)
  expect(await list.loadCall()).toEqual({ data: ['a'] })
})

test('pages get a copy, so changing it leaves the held list alone', async () => {
  const { list } = counting([['a']])
  const { data } = await list.loadCall()
  data!.push('b')
  expect(list.getSnapshot().items).toEqual(['a'])
})

/** Load the three app lists, so a write has something to invalidate. */
async function loadAll() {
  fakeServer({
    'GET /api/attributes': { body: [attribute({ id: 1, name: 'Energy' })] },
    'GET /api/tags': { body: [tag({ id: 1, name: 'Quick' })] },
    'GET /api/ingredients': { body: [] },
    'POST /api/attributes': { status: 201, body: attribute({ id: 2, name: 'Fat' }) },
    'PUT /api/preferences': { body: {} },
    'POST /api/logout': 204,
    'PUT /api/plan': { body: {} },
  })
  await Promise.all([attributesList.loadCall(), tagsList.loadCall(), ingredientsList.loadCall()])
}

const stale = async () => {
  const answers = await Promise.all([attributesList.loadCall(), tagsList.loadCall(), ingredientsList.loadCall()])
  // A held list answers with a refresh; an invalidated one waited instead.
  return answers.map((answer) => (answer.refreshed ? 'reused' : 'fetched'))
}

test('a new attribute invalidates the attributes only', async () => {
  await loadAll()
  await api.POST('/api/attributes', { body: { name: 'Fat', unit: 'g', decimals: 1 } })
  expect(attributesList.getSnapshot().items).toHaveLength(1) // still shown meanwhile
  expect(await stale()).toEqual(['fetched', 'reused', 'reused'])
})

test('saving the plan invalidates the attributes (goals) and the tags (filters)', async () => {
  await loadAll()
  await api.PUT('/api/plan', { body: {} as never })
  expect(await stale()).toEqual(['fetched', 'fetched', 'reused'])
})

test('a write that changes no list invalidates none', async () => {
  await loadAll()
  await api.PUT('/api/preferences', { body: { 'unit.mass': 'kg' } })
  expect(await stale()).toEqual(['reused', 'reused', 'reused'])
})

test('a write not in the table invalidates every list', async () => {
  await loadAll()
  await api.POST('/api/logout')
  expect(await stale()).toEqual(['fetched', 'fetched', 'fetched'])
})

test('a write that fails on the way still invalidates', async () => {
  await loadAll()
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  await expect(api.POST('/api/attributes', { body: { name: 'Fat', unit: 'g', decimals: 1 } })).rejects.toThrow()
  fakeServer({ 'GET /api/attributes': { body: [] }, 'GET /api/tags': { body: [] }, 'GET /api/ingredients': { body: [] } })
  expect(await stale()).toEqual(['fetched', 'reused', 'reused'])
})

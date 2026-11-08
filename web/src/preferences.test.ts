import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { resetPreferences, usePreferences } from './preferences'
import { fakeServer } from './test-app'
import { preferences } from './test-data'

afterEach(() => {
  resetPreferences()
  vi.unstubAllGlobals()
})

test('load fetches once for two calls', async () => {
  const calls = fakeServer({ 'GET /api/preferences': { body: preferences() } })
  const store = usePreferences()
  await store.load()
  await store.load()
  expect(calls).toEqual(['GET /api/preferences'])
  expect(store.preferences.value).toEqual(preferences())
})

test('a failed load sets failed and the next load tries again', async () => {
  let status = 500
  const calls = fakeServer({ 'GET /api/preferences': () => ({ status, body: preferences() }) })
  const store = usePreferences()
  await store.load()
  expect(store.failed.value).toBe(true)
  expect(store.preferences.value).toBeNull()
  status = 200
  await store.load()
  expect(store.failed.value).toBe(false)
  expect(store.preferences.value).toEqual(preferences())
  expect(calls).toHaveLength(2)
})

test('set sends only the changed key and keeps the answer', async () => {
  const sent: unknown[] = []
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': (body) => {
      sent.push(body)
      return { body: preferences({ 'unit.mass': 'kg' }) }
    },
  })
  const store = usePreferences()
  await store.load()
  expect(await store.set('unit.mass', 'kilogram')).toBe(true)
  expect(sent).toEqual([{ 'unit.mass': 'kilogram' }])
  expect(store.preferences.value).toEqual(preferences({ 'unit.mass': 'kg' }))
})

test('a refusal returns false and leaves the state', async () => {
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': { status: 422, body: { detail: [{ loc: ['body', 'unit.mass'], type: 'invalid_unit', msg: 'no' }] } },
  })
  const store = usePreferences()
  await store.load()
  expect(await store.set('unit.mass', 'dl')).toBe(false)
  expect(store.preferences.value).toEqual(preferences())
})

test('a thrown fetch returns false', async () => {
  fakeServer({ 'GET /api/preferences': { body: preferences() } })
  const store = usePreferences()
  await store.load()
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
  expect(await store.set('unit.mass', 'kg')).toBe(false)
  expect(store.preferences.value).toEqual(preferences())
})

test('two components see one state', async () => {
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': { body: preferences({ 'unit.volume': 'msk' }) },
  })
  const stores: ReturnType<typeof usePreferences>[] = []
  for (let i = 0; i < 2; i++) {
    mount(
      defineComponent({
        setup() {
          stores.push(usePreferences())
          return () => null
        },
      }),
    )
  }
  await stores[0]!.load()
  await stores[0]!.set('unit.volume', 'msk')
  expect(stores[1]!.preferences.value?.['unit.volume']).toBe('msk')
})

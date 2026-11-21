import { afterEach, expect, test, vi } from 'vitest'
import { preferences } from '../../test-data'
import { fakeServer } from '../test-app'
import { preferencesStore, preferredUnit } from './preferences'

// A port of the Vue preferences tests (src/preferences.test.ts) to the
// neutral store.

afterEach(() => {
  preferencesStore.reset()
  vi.unstubAllGlobals()
})

const current = () => preferencesStore.getSnapshot().preferences

/** Lets the promise callbacks queued so far run. */
const settled = () => new Promise((resolve) => setTimeout(resolve))

test('load fetches once for two calls', async () => {
  const calls = fakeServer({ 'GET /api/preferences': { body: preferences() } })
  await preferencesStore.load()
  await preferencesStore.load()
  expect(calls).toEqual(['GET /api/preferences'])
  expect(current()).toEqual(preferences())
})

test('a failed load sets failed and the next load tries again', async () => {
  let status = 500
  const calls = fakeServer({ 'GET /api/preferences': () => ({ status, body: preferences() }) })
  await preferencesStore.load()
  expect(preferencesStore.getSnapshot().failed).toBe(true)
  expect(current()).toBeNull()
  status = 200
  await preferencesStore.load()
  expect(preferencesStore.getSnapshot()).toEqual({ preferences: preferences(), loading: false, failed: false })
  expect(calls).toHaveLength(2)
})

test('a load in flight at a reset does not fill the state', async () => {
  const answers: ((reply: { body: unknown }) => void)[] = []
  fakeServer({ 'GET /api/preferences': () => new Promise((resolve) => answers.push(resolve)) })
  const old = preferencesStore.load()
  await vi.waitFor(() => expect(answers).toHaveLength(1))
  preferencesStore.reset()
  answers[0]!({ body: preferences() })
  await old
  expect(preferencesStore.getSnapshot()).toEqual({ preferences: null, loading: false, failed: false })
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
  await preferencesStore.load()
  expect(await preferencesStore.set('unit.mass', 'kilogram')).toBe(true)
  expect(sent).toEqual([{ 'unit.mass': 'kilogram' }])
  expect(current()).toEqual(preferences({ 'unit.mass': 'kg' }))
})

test('a refusal returns false and leaves the state', async () => {
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': { status: 422, body: { detail: [{ loc: ['body', 'unit.mass'], type: 'invalid_unit', msg: 'no' }] } },
  })
  await preferencesStore.load()
  expect(await preferencesStore.set('unit.mass', 'dl')).toBe(false)
  expect(current()).toEqual(preferences())
})

test('a thrown fetch returns false', async () => {
  fakeServer({ 'GET /api/preferences': { body: preferences() } })
  await preferencesStore.load()
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
  expect(await preferencesStore.set('unit.mass', 'kg')).toBe(false)
  expect(current()).toEqual(preferences())
})

test('every subscriber sees a save', async () => {
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': { body: preferences({ 'unit.volume': 'msk' }) },
  })
  await preferencesStore.load()
  const seen: (string | undefined)[][] = [[], []]
  const stops = seen.map((list) =>
    preferencesStore.subscribe(() => list.push(preferencesStore.getSnapshot().preferences?.['unit.volume'])),
  )
  await preferencesStore.set('unit.volume', 'msk')
  for (const stop of stops) stop()
  expect(seen).toEqual([['msk'], ['msk']])
})

test('overlapping saves go one after the other and the last answer stays', async () => {
  const answers: ((reply: { body: unknown }) => void)[] = []
  const started: unknown[] = []
  fakeServer({
    'GET /api/preferences': { body: preferences() },
    'PUT /api/preferences': (body) => {
      started.push(body)
      return new Promise((resolve) => answers.push(resolve))
    },
  })
  await preferencesStore.load()
  const first = preferencesStore.set('unit.mass', 'kg')
  const second = preferencesStore.set('unit.volume', 'msk')
  await settled()
  expect(started).toEqual([{ 'unit.mass': 'kg' }])
  answers[0]!({ body: preferences({ 'unit.mass': 'kg' }) })
  await settled()
  expect(started).toEqual([{ 'unit.mass': 'kg' }, { 'unit.volume': 'msk' }])
  answers[1]!({ body: preferences({ 'unit.mass': 'kg', 'unit.volume': 'msk' }) })
  expect(await Promise.all([first, second])).toEqual([true, true])
  expect(current()).toEqual(preferences({ 'unit.mass': 'kg', 'unit.volume': 'msk' }))
})

test('preferredUnit gives the preferred unit of each category, undefined before loading', () => {
  const loaded = preferences({ 'unit.mass': 'kg', 'unit.volume': 'dl', 'unit.energy': 'kJ' })
  expect(preferredUnit(loaded, 'mass')).toBe('kg')
  expect(preferredUnit(loaded, 'volume')).toBe('dl')
  expect(preferredUnit(loaded, 'energy')).toBe('kJ')
  expect(preferredUnit(null, 'mass')).toBeUndefined()
})

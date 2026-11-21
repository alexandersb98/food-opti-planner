import { afterEach, expect, test, vi } from 'vitest'
import { unitCatalogue } from '../../test-data'
import { fakeServer } from '../test-app'
import { catalogue, unitsStore } from './units'

// A port of the Vue units tests (src/units.test.ts) to the neutral store.

afterEach(() => {
  unitsStore.reset()
  vi.unstubAllGlobals()
})

async function loaded() {
  const calls = fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  await unitsStore.load()
  return { units: catalogue(unitsStore.getSnapshot().units), calls }
}

const symbols = (list: { symbol: string }[]) => list.map((u) => u.symbol)

test('load fetches once for two calls', async () => {
  const { calls } = await loaded()
  await unitsStore.load()
  expect(calls).toEqual(['GET /api/units'])
  expect(unitsStore.getSnapshot().units).toHaveLength(33)
})

test('two loads at once share one fetch', async () => {
  const calls = fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  await Promise.all([unitsStore.load(), unitsStore.load()])
  expect(calls).toEqual(['GET /api/units'])
})

test('a load tells the subscribers, with a new snapshot each change', async () => {
  fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  const seen: unknown[] = []
  const stop = unitsStore.subscribe(() => seen.push(unitsStore.getSnapshot()))
  await unitsStore.load()
  stop()
  expect(seen).toEqual([
    { units: [], loading: true, failed: false },
    { units: expect.any(Array), loading: false, failed: false },
  ])
  expect(unitsStore.getSnapshot()).toBe(seen[1])
})

test('a failed load sets failed and the next load tries again', async () => {
  let reply: number | { body: unknown } = 500
  const calls = fakeServer({ 'GET /api/units': () => (typeof reply === 'number' ? { status: reply } : reply) })
  await unitsStore.load()
  expect(unitsStore.getSnapshot().failed).toBe(true)
  expect(unitsStore.getSnapshot().units).toEqual([])
  reply = { body: unitCatalogue() }
  await unitsStore.load()
  expect(unitsStore.getSnapshot()).toMatchObject({ failed: false, loading: false })
  expect(unitsStore.getSnapshot().units).toHaveLength(33)
  expect(calls).toHaveLength(2)
})

test('a thrown fetch is a failed load', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
  await unitsStore.load()
  expect(unitsStore.getSnapshot().failed).toBe(true)
})

test('a load in flight at a reset does not fill the state, and the next load fetches again', async () => {
  const answers: ((reply: { body: unknown }) => void)[] = []
  fakeServer({ 'GET /api/units': () => new Promise((resolve) => answers.push(resolve)) })
  const old = unitsStore.load()
  await vi.waitFor(() => expect(answers).toHaveLength(1))
  unitsStore.reset()
  answers[0]!({ body: unitCatalogue() })
  await old
  expect(unitsStore.getSnapshot()).toEqual({ units: [], loading: false, failed: false })
  const again = unitsStore.load()
  await vi.waitFor(() => expect(answers).toHaveLength(2))
  answers[1]!({ body: unitCatalogue() })
  await again
  expect(unitsStore.getSnapshot().units).toHaveLength(33)
})

test('offered lists each category in the server order', async () => {
  const { units } = await loaded()
  expect(symbols(units.offered('mass'))).toEqual(['µg', 'mg', 'g', 'kg', 'oz', 'lb'])
  expect(symbols(units.offered('volume'))).toEqual(['ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'fl oz', 'US cup', 'metric cup'])
  expect(symbols(units.offered('energy'))).toEqual(['kJ', 'kcal'])
})

test('findUnit finds every spelling in the fixture as its own unit', async () => {
  const { units } = await loaded()
  for (const unit of units.units) {
    for (const spelling of [unit.symbol, ...unit.aliases, ...unit.case_sensitive_aliases]) {
      expect(units.findUnit(spelling)?.symbol, spelling).toBe(unit.symbol)
    }
  }
})

test.each([
  ['gram', 'g'],
  ['MSK.', 'msk'],
  ['US  cup', 'US cup'],
  ['matsked', 'msk'],
  ['μg', 'µg'],
  ['ug', 'µg'],
  ['Cal', 'kcal'],
  ['cal', 'cal'],
  ['CAL', 'cal'],
  ['pcs', 'st'],
  ['  KG ', 'kg'],
])('findUnit reads %j as %j', async (text, symbol) => {
  const { units } = await loaded()
  expect(units.findUnit(text)?.symbol).toBe(symbol)
})

test.each(['cup', '', '  ', '.', 'kgs', 'MJ', 'Ml', 'Mg'])('findUnit does not know %j', async (text) => {
  const { units } = await loaded()
  expect(units.findUnit(text)).toBeUndefined()
})

test.each([['mJ', 'mJ'], ['ml', 'ml'], ['MJ.', undefined]])('findUnit reads %j by the server’s case rule', async (text, symbol) => {
  const { units } = await loaded()
  expect(units.findUnit(text)?.symbol).toBe(symbol)
})

test('label shows the symbol and the name', async () => {
  const { units } = await loaded()
  expect(units.label(units.findUnit('kg')!)).toBe('kg (kilogram)')
  expect(units.label(units.findUnit('msk')!)).toBe('msk (tablespoon)')
})

test('basisFor gives 100 for a mass or volume unit in any spelling and 1 for the rest', async () => {
  const { units } = await loaded()
  for (const text of ['g', 'kg', 'µg', 'dl', 'msk', 'US cup', 'oz', 'gram', 'MSK.']) {
    expect(units.basisFor(text), text).toBe('100')
  }
  for (const text of ['st', 'pcs', 'kcal', 'kJ', 'pinch', 'cup', '']) {
    expect(units.basisFor(text), text).toBe('1')
  }
})

test('basisFor gives 1 for everything while the catalogue is empty', () => {
  const units = catalogue(unitsStore.getSnapshot().units)
  expect(units.basisFor('g')).toBe('1')
  expect(units.basisFor('dl')).toBe('1')
})

test('offered(null) is the free-text unit st', async () => {
  const { units } = await loaded()
  expect(symbols(units.offered(null))).toEqual(['st'])
})

test('convertible follows the server rule: same category, or the same free text', async () => {
  const { units } = await loaded()
  const yes: [string, string][] = [
    ['g', 'kg'], ['g', 'mg'], ['kcal', 'kJ'], ['st', 'stycken'], ['dose', 'Dose'], ['gram', 'g'], ['g', 'g'],
  ]
  const no: [string, string][] = [
    ['g', 'ml'], ['dose', 'portion'], ['', ''], ['g', ''], ['', 'g'], ['dose', 'g'], ['g', 'dose'], ['kcal', 'g'],
  ]
  for (const [a, b] of yes) expect(units.convertible(a, b), `${a} ~ ${b}`).toBe(true)
  for (const [a, b] of no) expect(units.convertible(a, b), `${a} ~ ${b}`).toBe(false)
})

test('ratio is exact: one unit of the first makes this much of the second', async () => {
  const { units } = await loaded()
  const text = (a: string, b: string) => {
    const r = units.ratio(a, b)
    return r === null ? null : `${r.num}/${r.den}`
  }
  const value = (a: string, b: string) => {
    const r = units.ratio(a, b)!
    return Number(r.num) / Number(r.den)
  }
  expect(value('kg', 'g')).toBe(1000)
  expect(value('g', 'kg')).toBe(0.001)
  expect(value('oz', 'g')).toBeCloseTo(28.349523125, 12)
  expect(value('tsk', 'msk')).toBeCloseTo(1 / 3, 12)
  const cup = units.ratio('US cup', 'dl')!
  expect(cup.num * 1000000000n).toBe(2365882365n * cup.den)
  expect(text('g', 'ml')).toBeNull()
  expect(text('st', 'Stycken')).toBe('1/1')
  expect(text('Pinch', 'pinch')).toBe('1/1')
  expect(text('foo', 'bar')).toBeNull()
  expect(text('', '')).toBeNull()
  expect(text('g', 'st')).toBeNull()
})

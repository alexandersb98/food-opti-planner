import { afterEach, expect, test, vi } from 'vitest'
import { fakeServer } from './test-app'
import { unitCatalogue } from './test-data'
import { resetUnits, useUnits } from './units'

afterEach(() => {
  resetUnits()
  vi.unstubAllGlobals()
})

async function loaded() {
  const calls = fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  const units = useUnits()
  await units.load()
  return { units, calls }
}

const symbols = (list: { symbol: string }[]) => list.map((u) => u.symbol)

test('load fetches once for two calls', async () => {
  const { units, calls } = await loaded()
  await units.load()
  expect(calls).toEqual(['GET /api/units'])
  expect(units.units.value).toHaveLength(33)
})

test('a failed load sets failed and the next load tries again', async () => {
  let reply: number | { body: unknown } = 500
  const calls = fakeServer({ 'GET /api/units': () => (typeof reply === 'number' ? { status: reply } : reply) })
  const units = useUnits()
  await units.load()
  expect(units.failed.value).toBe(true)
  expect(units.units.value).toEqual([])
  reply = { body: unitCatalogue() }
  await units.load()
  expect(units.failed.value).toBe(false)
  expect(units.loading.value).toBe(false)
  expect(units.units.value).toHaveLength(33)
  expect(calls).toHaveLength(2)
})

test('a thrown fetch is a failed load', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
  const units = useUnits()
  await units.load()
  expect(units.failed.value).toBe(true)
})

test('offered lists each category in the server order', async () => {
  const { units } = await loaded()
  expect(symbols(units.offered('mass'))).toEqual(['µg', 'mg', 'g', 'kg', 'oz', 'lb'])
  expect(symbols(units.offered('volume'))).toEqual(['ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'fl oz', 'US cup', 'metric cup'])
  expect(symbols(units.offered('energy'))).toEqual(['kJ', 'kcal'])
})

test('findUnit finds every spelling in the fixture as its own unit', async () => {
  const { units } = await loaded()
  for (const unit of units.units.value) {
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

test.each([['mJ', 'mJ'], ['ml', 'ml'], ['MJ.', undefined]])('findUnit reads %j by the server\'s case rule', async (text, symbol) => {
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
  expect(useUnits().basisFor('g')).toBe('1')
  expect(useUnits().basisFor('dl')).toBe('1')
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

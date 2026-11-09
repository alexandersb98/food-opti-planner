import { beforeAll, expect, test } from 'vitest'
import { fakeServer } from './test-app'
import { conversion, ingredient, unitCatalogue } from './test-data'
import { fraction, same, times, type Fraction } from './fractions'
import { isOwn, lineFactor, pickerOptions } from './lineUnits'
import { resetUnits, useUnits } from './units'

// The same cases as tests/server/test_line_units.py: the editor and the
// server must route a line's unit alike.

const units = useUnits()

beforeAll(async () => {
  resetUnits()
  fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  await units.load()
})

const ratio = (a: string, b: string) => units.ratio(a, b)
const dl40 = [conversion({ id: 1, unit: 'dl', factor: '40' })]
const g = (conversions = [] as ReturnType<typeof conversion>[]) => ingredient({ id: 1, name: 'Oats', unit: 'g', conversions })
const factor = (unit: string, own = 'g', conversions = [] as ReturnType<typeof conversion>[]) =>
  lineFactor(ratio, ingredient({ id: 1, name: 'X', unit: own, conversions }), unit)
const is = (found: Fraction | null, text: string) => {
  expect(found, text).not.toBeNull()
  expect(same(found, fraction(text)), `${found?.num}/${found?.den} is ${text}`).toBe(true)
}

test('the own unit has factor 1, spelled any way', () => {
  for (const [unit, own] of [['', 'g'], ['g', 'g'], ['gram', 'g'], ['stycken', 'st'], ['Portion', 'portion'], [' portion', 'Portion']] as const) {
    is(factor(unit, own), '1')
    expect(isOwn(ratio, { unit: own }, unit), `${unit} is own for ${own}`).toBe(true)
  }
})

test('a stored conversion for the unit gives its factor, in any spelling of the unit', () => {
  is(factor('DL', 'g', dl40), '40')
  is(factor('Pinch', 'g', [conversion({ id: 2, unit: 'pinch', factor: '0.3' })]), '0.3')
  is(factor('g', 'st', [conversion({ id: 3, unit: 'g', factor: '0.01' })]), '0.01')
  is(factor('tbsp', 'g', [conversion({ id: 4, unit: 'msk', factor: '10' })]), '10')
})

test('a stored conversion wins over a catalogue step', () => {
  is(factor('msk', 'g', [...dl40, conversion({ id: 2, unit: 'msk', factor: '10' })]), '10')
})

test('a catalogue step goes straight to the own unit', () => {
  is(factor('oz'), '28.349523125')
  is(factor('kg'), '1000')
  is(factor('msk', 'dl'), '0.15')
  is(factor('tsk', 'l'), '0.005')
})

test('a catalogue step can go through a conversion', () => {
  is(factor('msk', 'g', dl40), '6')
  is(factor('US cup', 'g', dl40), '94.6352946')
  const cup = factor('US cup', 'g', dl40)!
  expect(same(cup, times(ratio('US cup', 'dl')!, fraction('40')))).toBe(true)
})

test('the first conversion in order wins when a step goes through one', () => {
  is(factor('tsk', 'g', [conversion({ id: 1, unit: 'dl', factor: '40' }), conversion({ id: 2, unit: 'msk', factor: '6' })]), '2')
  is(factor('tsk', 'g', [conversion({ id: 2, unit: 'msk', factor: '6' }), conversion({ id: 1, unit: 'dl', factor: '40' })]), '2')
})

test('a unit that does not convert gives null', () => {
  expect(factor('dl')).toBeNull()
  expect(factor('g', 'dl')).toBeNull()
  expect(factor('cup')).toBeNull()
  expect(factor('kcal')).toBeNull()
  expect(factor('pinch', 'st')).toBeNull()
  expect(factor('dl', 'g', [conversion({ id: 1, unit: 'pinch', factor: '0.3' })])).toBeNull()
  expect(factor('pinch', 'g', dl40)).toBeNull()
  expect(isOwn(ratio, { unit: 'g' }, 'kg')).toBe(false)
})

// The picker's options.

const offered = () => [...units.offered('mass'), ...units.offered('volume'), ...units.offered(null)]
const symbols = (list: { symbol: string }[]) => list.map((u) => u.symbol)

test('a gram ingredient with no conversion offers the mass units, not the volume ones', () => {
  const options = pickerOptions(ratio, offered(), g())
  expect(options.own).toBe('g')
  expect(symbols(options.steps)).toEqual(['µg', 'mg', 'kg', 'oz', 'lb'])
  expect(options.conversions).toEqual([])
})

test('with a dl conversion the volume units are offered too, and dl only as a conversion', () => {
  const options = pickerOptions(ratio, offered(), g(dl40))
  expect(symbols(options.steps)).toEqual([
    'µg', 'mg', 'kg', 'oz', 'lb', 'ml', 'cl', 'l', 'krm', 'tsk', 'msk', 'fl oz', 'US cup', 'metric cup',
  ])
  expect(options.conversions.map((c) => c.unit)).toEqual(['dl'])
})

test('a piece ingredient offers no catalogue unit', () => {
  const options = pickerOptions(ratio, offered(), ingredient({ id: 2, name: 'Egg', unit: 'st', conversions: [] }))
  expect(options.steps).toEqual([])
  const withGrams = pickerOptions(ratio, offered(), ingredient({ id: 2, name: 'Egg', unit: 'st', conversions: [conversion({ id: 1, unit: 'g', factor: '0.02' })] }))
  expect(symbols(withGrams.steps)).toContain('kg')
  expect(symbols(withGrams.steps)).not.toContain('g')
})

test('an AI conversion is kept as it is, for the picker to flag', () => {
  const ai = conversion({ id: 2, unit: 'pinch', factor: '0.3', source: 'ai' })
  expect(pickerOptions(ratio, offered(), g([ai])).conversions[0]!.source).toBe('ai')
})

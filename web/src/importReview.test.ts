import { beforeAll, expect, test } from 'vitest'
import { acceptable, suggestedFactorFor, factorSource, ingredientWithPending, lineState, needsYou, pendingKey, type PendingConversion } from './importReview'
import { fakeServer } from './test-app'
import { conversion, ingredient, unitCatalogue } from './test-data'
import { resetUnits, useUnits } from './units'

const units = useUnits()

beforeAll(async () => {
  resetUnits()
  fakeServer({ 'GET /api/units': { body: unitCatalogue() } })
  await units.load()
})

const ratio = (a: string, b: string) => units.ratio(a, b)
const oats = ingredient({ id: 1, name: 'Oats', unit: 'g' })
const withDl = ingredient({ id: 2, name: 'Flour', unit: 'g', conversions: [conversion({ id: 1, unit: 'dl', factor: '40' })] })
const line = (unit = '', over = {}) => ({ skipped: false, ingredientId: 1 as number | null, unit, ...over })
const state = (l: ReturnType<typeof line>, i: typeof oats | undefined = oats, pending: PendingConversion[] = []) =>
  lineState(l, i, pending, ratio)

test('skipped wins over everything else', () => {
  expect(state(line('kcal', { skipped: true }))).toBe('skipped')
  expect(state(line('', { skipped: true, ingredientId: null }), undefined)).toBe('skipped')
})

test('a line with no ingredient is unmatched', () => {
  expect(state(line('', { ingredientId: null }), undefined)).toBe('unmatched')
})

test('own unit, empty unit and a catalogue step are ready', () => {
  expect(state(line(''))).toBe('ready')
  expect(state(line('g'))).toBe('ready')
  expect(state(line('oz'))).toBe('ready')
})

test('a stored conversion makes a unit ready, none needs a factor', () => {
  expect(state(line('dl', { ingredientId: 2 }), withDl)).toBe('ready')
  expect(state(line('dl'))).toBe('needs_factor')
  expect(state(line('klyfta'))).toBe('needs_factor')
})

test('a pending conversion makes the unit ready', () => {
  const pending: PendingConversion[] = [{ ingredientId: 1, unit: 'DL', factor: '40', source: 'ai' }]
  expect(state(line('dl'), oats, pending)).toBe('ready')
  expect(state(line('dl', { ingredientId: 3 }), ingredient({ id: 3, name: 'Y' }), pending)).toBe('needs_factor')
})

test('an energy unit is a bad unit', () => {
  expect(state(line('kcal'))).toBe('bad_unit')
})

test('pendingKey ignores case and spaces', () => {
  expect(pendingKey(1, ' DL ')).toBe(pendingKey(1, 'dl'))
  expect(pendingKey(1, 'dl')).not.toBe(pendingKey(2, 'dl'))
})

test('ingredientWithPending adds only that ingredient\'s conversions', () => {
  const pending: PendingConversion[] = [
    { ingredientId: 1, unit: 'dl', factor: '40', source: 'ai' },
    { ingredientId: 9, unit: 'msk', factor: '1', source: 'user' },
  ]
  expect(ingredientWithPending(oats, pending).conversions.map((c) => c.unit)).toEqual(['dl'])
  expect(ingredientWithPending(oats, [])).toBe(oats)
})

test('needsYou counts unmatched, needs-factor and bad-unit lines', () => {
  const ingredients = new Map([[1, oats]])
  const lines = [
    line('', { ingredientId: null }),
    line('dl'),
    line('kcal'),
    line('g'),
    line('dl', { skipped: true }),
  ]
  expect(needsYou(lines, ingredients, [], ratio)).toBe(3)
})

test.each([
  ['100', '100'],
  ['0.5', '0.5'],
  ['1,5', '1.5'],
  ['0', null],
  ['-1', null],
  ['abc', null],
  ['0.1234567', null],
  ['1234567890', null],
  ['123456789', '123456789'],
])('acceptable(%s) is %s', (text, expected) => {
  expect(acceptable(text)).toBe(expected)
})

test('factorSource is ai only while the number is the suggestion', () => {
  expect(factorSource('100', '100')).toBe('ai')
  expect(factorSource('100.0', '100')).toBe('ai')
  expect(factorSource('90', '100')).toBe('user')
  expect(factorSource('100', null)).toBe('user')
})

test('a suggestion is for the unit it was made for, not for a line that changed unit', () => {
  const imported = { ingredientId: 3, unit: 'dl', suggestedFactor: '50', suggestedUnit: 'dl' }
  expect(suggestedFactorFor(imported, [imported])).toBe('50')
  const changed = { ...imported, unit: 'cup' }
  expect(suggestedFactorFor(changed, [changed])).toBeNull()
  // another line of the pair, still in dl, shares it
  expect(suggestedFactorFor({ ingredientId: 3, unit: 'DL' }, [imported])).toBe('50')
  expect(suggestedFactorFor({ ingredientId: 4, unit: 'dl' }, [imported])).toBeNull()
  expect(suggestedFactorFor({ ingredientId: null, unit: 'dl' }, [imported])).toBeNull()
})

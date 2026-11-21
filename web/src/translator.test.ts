import { expect, test } from 'vitest'
import { clashServerErrors } from './clash'
import { boundError, rangeText, type Translate as GoalsTranslate } from './goals'
import { missRows } from './misses'
import { attribute, goal, plan, planResult, resultGoal, resultMiss, unitChangeRefusal } from './test-data'
import { englishPlural, findLocale, locales, makeTranslator, type Locale, type Messages } from './translator'
import { refusalText, type Translate as UnitChangeTranslate } from './unitChange'

const english = findLocale('en')

/** A translator over `messages`, recording the keys it found no message for. */
function translator(messages: Messages) {
  const missing: string[] = []
  const locale: Locale = { code: 'en', name: 'English', messages, plural: englishPlural }
  return { t: makeTranslator(locale, (key) => missing.push(key)), missing }
}

/** Every message in a file, by its dotted key. */
function flatten(messages: Messages, prefix = ''): [string, string][] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value] as [string, string]] : flatten(value, `${prefix}${key}.`),
  )
}

const englishMessages = flatten(english.messages)

test('every English message uses only the syntax the translator reads', () => {
  // Braces only around a placeholder name; no linked messages ("@:", "@.").
  const unsupported = englishMessages.filter(
    ([, message]) => /[{}]/.test(message.replace(/\{\w+\}/g, '')) || /@[.:]/.test(message),
  )
  expect(unsupported).toEqual([])
})

test('every English message renders with sample values and leaves no placeholder behind', () => {
  const { t, missing } = translator(english.messages)
  for (const [key, message] of englishMessages) {
    const named = Object.fromEntries([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => [name, `«${name}»`]))
    const plural = message.includes('|')
    const texts = plural ? [0, 1, 2, 7].map((count) => t(key, named, count)) : [t(key, named)]
    for (const text of texts) {
      expect(text, key).not.toMatch(/[{}|]/)
      expect(text.trim(), key).not.toBe('')
    }
  }
  expect(missing).toEqual([])
})

test('two plural forms are one | other', () => {
  const { t } = translator({ apples: '{n} apple | {n} apples' })
  expect(t('apples', 0)).toBe('0 apples')
  expect(t('apples', 1)).toBe('1 apple')
  expect(t('apples', 5)).toBe('5 apples')
})

test('three plural forms are zero | one | other', () => {
  const { t } = translator({ apples: 'no apples | 1 apple | {n} apples' })
  expect(t('apples', 0)).toBe('no apples')
  expect(t('apples', 1)).toBe('1 apple')
  expect(t('apples', 12)).toBe('12 apples')
})

test('the count fills {n} and {count}, unless a named value of that name is given', () => {
  const { t } = translator({ items: '{count} item | {n} items' })
  expect(t('items', 3)).toBe('3 items')
  expect(t('items', 1)).toBe('1 item')
  expect(t('items', { n: 'three' }, 3)).toBe('three items')
})

test('a number named n or count picks the plural form, as in vue-i18n', () => {
  const { t } = translator({ mapped: '{mapped} of {n} column mapped | {mapped} of {n} columns mapped' })
  expect(t('mapped', { mapped: 2, n: 3 })).toBe('2 of 3 columns mapped')
  expect(t('mapped', { mapped: 1, n: 1 })).toBe('1 of 1 column mapped')
})

test('named values fill their placeholders; a missing one is left empty', () => {
  const { t } = translator({ line: '{amount} {unit} of {food}' })
  expect(t('line', { amount: 2, unit: 'dl', food: 'milk' })).toBe('2 dl of milk')
  expect(t('line', { amount: 2, food: 'milk' })).toBe('2  of milk')
  expect(t('line', { amount: null, unit: 'dl', food: 'milk' })).toBe(' dl of milk')
})

test('the four call shapes: key, key and named, key and count, key, named and count', () => {
  const { t } = translator({ plain: 'Saved.', named: 'Saved {name}.', counted: '{n} saved | {n} saved', both: '{name}: {n} line | {name}: {n} lines' })
  expect(t('plain')).toBe('Saved.')
  expect(t('named', { name: 'Oats' })).toBe('Saved Oats.')
  expect(t('counted', 4)).toBe('4 saved')
  expect(t('both', { name: 'Oats' }, 2)).toBe('Oats: 2 lines')
})

test('a plural message without a count reads as one, as vue-i18n does', () => {
  const { t } = translator({ apples: 'no apples | 1 apple | {n} apples' })
  expect(t('apples')).toBe('1 apple')
})

test('the spaces next to "|" are dropped, a message\'s own spaces kept', () => {
  const { t } = translator({ spaced: ' one  |  other ' })
  expect(t('spaced', 1)).toBe(' one')
  expect(t('spaced', 2)).toBe('other ')
})

test('a missing key shows the key itself and is reported', () => {
  const { t, missing } = translator({ group: { here: 'Here' } })
  expect(t('group.gone')).toBe('group.gone')
  expect(t('group')).toBe('group')
  expect(t('group.here.deeper', 2)).toBe('group.here.deeper')
  expect(t('group.here')).toBe('Here')
  expect(missing).toEqual(['group.gone', 'group', 'group.here.deeper'])
})

test('English is the only locale for now, and an unknown code falls back to it', () => {
  expect(locales.map((locale) => locale.code)).toEqual(['en'])
  expect(findLocale('sv')).toBe(english)
})

test('the framework-neutral modules take the translator', () => {
  const t = makeTranslator(english)
  // Both Translate types the modules declare accept it.
  const forGoals: GoalsTranslate = t
  const forUnitChange: UnitChangeTranslate = t

  expect(rangeText('10', '20', 'g', forGoals)).toBe('10–20 g')
  expect(boundError('too_many_decimals', { name: 'Protein', decimals: 1 }, forGoals)).toBe('At most 1 decimals for Protein.')

  const setup = plan({ goals: [goal({ id: 7, attribute_id: 1, max: '50', min: null, must: true })] })
  expect(clashServerErrors({ 'goals.0.max': 'too_many_decimals' }, setup, [attribute({ id: 1, name: 'Energy' })], [7], t)).toEqual({
    7: expect.objectContaining({ max: 'At most 0 decimals for Energy.' }),
  })

  const result = planResult({
    id: 1,
    attributes: [{ name: 'Protein', unit: 'g', decimals: 0 }],
    day_totals: Array.from({ length: 7 }, () => ['100']),
    goals: [resultGoal({ name: 'Protein per day', attribute: 0, min: '120' })],
    misses: [
      resultMiss({ goal: 0, day: 1, bound: '120', actual: '110', amount: '10', percent: '8.3' }),
      resultMiss({ goal: 0, day: 4, bound: '120', actual: '98', amount: '22', percent: '18.3' }),
    ],
  })
  expect(missRows(result, t)).toHaveLength(1)
  expect(missRows(result, t)[0].title).toContain('2 days')

  const refusal = unitChangeRefusal({ type: 'unit_has_dependents', name: 'Oats', conversions: 2, lines: 3 })
  expect(refusalText(forUnitChange, refusal, { from: 'g', to: 'dl' })).toBe(
    "Oats has 2 conversions and 3 recipe lines in other units, so its unit can't change from g to dl. Delete or change them first.",
  )
})

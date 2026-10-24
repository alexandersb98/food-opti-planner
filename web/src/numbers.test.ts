import { expect, test } from 'vitest'
import { typedNumber } from './numbers'

test('reads plain decimal numbers as typed', () => {
  expect(['16.9', ' 100 ', '0', '-2.5', '.5', '3.'].map(typedNumber)).toEqual([
    '16.9',
    '100',
    '0',
    '-2.5',
    '.5',
    '3.',
  ])
})

test('takes a comma as the decimal point', () => {
  expect(typedNumber('16,9')).toBe('16.9')
})

test('rejects anything else', () => {
  expect(['', ' ', 'abc', '1.2.3', '1,2,3', '1e3', '--1', '1 000', 'NaN', '.'].map(typedNumber)).toEqual(
    Array(10).fill(null),
  )
})

import { expect, test } from 'vitest'
import { errorType, fieldErrors } from './errors'

test('gives each body field its first error type', () => {
  const error = {
    detail: [
      { loc: ['body', 'name'], type: 'name_in_use', msg: 'in use' },
      { loc: ['body', 'name'], type: 'string_too_long', msg: 'long' },
      { loc: ['body', 'values', 0, 'value'], type: 'decimal_parsing', msg: 'not a number' },
    ],
  }
  expect(fieldErrors(error)).toEqual({ name: 'name_in_use', 'values.0.value': 'decimal_parsing' })
})

test('ignores anything that is not about a body field', () => {
  expect(fieldErrors(undefined)).toEqual({})
  expect(fieldErrors({ detail: 'No such tag' })).toEqual({})
  expect(fieldErrors({ detail: [{ loc: ['path', 'tag_id'], type: 'int_parsing' }] })).toEqual({})
})

test('errorType gives the first type whatever its place', () => {
  expect(errorType({ detail: [{ loc: ['body'], type: 'limit_reached', msg: 'x' }] })).toBe('limit_reached')
  expect(errorType({ detail: [{ loc: ['body', 'text'], type: 'no_recipe' }, { loc: ['body'], type: 'other' }] })).toBe('no_recipe')
  expect(errorType({ detail: 'No such tag' })).toBeNull()
  expect(errorType(undefined)).toBeNull()
  expect(errorType({ detail: [{ loc: [], type: 5 }] })).toBeNull()
})

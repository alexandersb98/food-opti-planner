import { expect, test } from 'vitest'
import { fieldErrors } from './errors'

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

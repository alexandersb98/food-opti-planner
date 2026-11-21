import { expect, test } from 'vitest'
import { latestQuestion } from './latest'

test('only the latest question asked is current', () => {
  const next = latestQuestion()
  const first = next()
  expect(first()).toBe(true)
  const second = next()
  expect(first()).toBe(false)
  expect(second()).toBe(true)
})

test('each sequence counts its own questions', () => {
  const one = latestQuestion()
  const other = latestQuestion()
  const asked = one()
  other()
  expect(asked()).toBe(true)
})

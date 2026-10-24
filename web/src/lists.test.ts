import { expect, test } from 'vitest'
import { byId, searchByName } from './lists'

test('byId finds rows by their id', () => {
  const rows = [
    { id: 3, name: 'a' },
    { id: 7, name: 'b' },
  ]
  expect(byId(rows).get(7)).toBe(rows[1])
  expect(byId(rows).get(1)).toBeUndefined()
})

test('searchByName keeps names containing the text, ignoring case, sorted by name', () => {
  const rows = [{ name: 'Oats' }, { name: 'egg' }, { name: 'Goat cheese' }, { name: 'Milk' }]
  expect(searchByName(rows, '').map((row) => row.name)).toEqual(['egg', 'Goat cheese', 'Milk', 'Oats'])
  expect(searchByName(rows, ' OAT ').map((row) => row.name)).toEqual(['Goat cheese', 'Oats'])
  expect(rows[0]!.name).toBe('Oats') // the given list is not reordered
  // A `clearable` box gives null, not '', when it is cleared.
  expect(searchByName(rows, null).map((row) => row.name)).toEqual(['egg', 'Goat cheese', 'Milk', 'Oats'])
})

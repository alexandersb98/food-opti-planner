import { expect, test } from 'vitest'
import { byId, filterByName, sortByName } from './lists'

test('byId finds rows by their id', () => {
  const rows = [
    { id: 3, name: 'a' },
    { id: 7, name: 'b' },
  ]
  expect(byId(rows).get(7)).toBe(rows[1])
  expect(byId(rows).get(1)).toBeUndefined()
})

test('sortByName sorts by name as localeCompare does, into a new list', () => {
  const rows = [{ name: 'Oats' }, { name: 'egg' }, { name: 'Goat cheese' }, { name: 'Milk' }, { name: 'éclair' }]
  const names = rows.map((row) => row.name)
  expect(sortByName(rows).map((row) => row.name)).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  expect(sortByName(rows).map((row) => row.name)).toEqual(['éclair', 'egg', 'Goat cheese', 'Milk', 'Oats'])
  expect(rows[0]!.name).toBe('Oats') // the given list is not reordered
})

test('filterByName keeps names containing the text, ignoring case, in the given order', () => {
  const rows = [{ name: 'egg' }, { name: 'Goat cheese' }, { name: 'Milk' }, { name: 'Oats' }]
  expect(filterByName(rows, ' OAT ').map((row) => row.name)).toEqual(['Goat cheese', 'Oats'])
  expect(filterByName(rows, 'xyz')).toEqual([])
  // A blank search keeps every row; a `clearable` box gives null, not ''.
  expect(filterByName(rows, '')).toBe(rows)
  expect(filterByName(rows, '  ')).toBe(rows)
  expect(filterByName(rows, null)).toBe(rows)
})

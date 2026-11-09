import { expect, test } from 'vitest'
import { contrastText } from './colours'

test.each([
  ['#ffffff', '#1d1d1d'],
  ['#000000', '#ffffff'],
  ['#1976d2', '#ffffff'],
  ['#ffeb3b', '#1d1d1d'],
  ['#FFEB3B', '#1d1d1d'],
])('%s gets %s', (colour, text) => {
  expect(contrastText(colour)).toBe(text)
})

test.each(['', 'red', '#fff', '#12345', '#gggggg', 'rgb(0,0,0)'])('%j is not #rrggbb, so dark text', (colour) => {
  expect(contrastText(colour)).toBe('#1d1d1d')
})

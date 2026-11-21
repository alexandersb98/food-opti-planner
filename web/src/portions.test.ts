import { expect, test } from 'vitest'
import { portionAmount, portionFigure } from './portions'

test('portions read as a cook reads them: to a tenth, halves and quarters as fractions', () => {
  expect(['0.657', '1.939', '1.5', '0.75', '2', '0.26', '1.000'].map((p) => portionFigure(portionAmount(p)))).toEqual([
    '0.7',
    '1.9',
    '1½',
    '¾',
    '2',
    '¼',
    '1',
  ])
})

test('the brief and The Menu read a portion the same way', () => {
  expect(['0.66', '1.333', '0.5', '0.24'].map((p) => portionFigure(portionAmount(p)))).toEqual(['0.7', '1.3', '½', '¼'])
})

import { expect, test } from 'vitest'
import { valueText } from './format'

test('a value reads with its attribute name and unit', () => {
  expect(valueText({ name: 'Energy', unit: 'kcal' }, '389')).toBe('Energy 389 kcal')
  expect(valueText({ name: 'Servings', unit: '' }, '2')).toBe('Servings 2')
})

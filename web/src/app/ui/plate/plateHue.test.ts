import { expect, test } from 'vitest'
import { plateDish, plateHue } from './plateHue'

test('a recipe keeps its hue', () => {
  expect(plateHue(7)).toBe(plateHue(7))
  expect(plateHue('r7')).toBe(plateHue('r7'))
  expect(plateHue(7)).toBe(plateHue(7.0))
})

test('hues are whole degrees on the wheel', () => {
  for (const id of [0, 1, 2, 99, 12345, 'r1', 'oats']) {
    const hue = plateHue(id)
    expect(Number.isInteger(hue)).toBe(true)
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
  }
})

test('recipes that follow each other get hues far apart', () => {
  const hues = Array.from({ length: 12 }, (_, i) => plateHue(i + 1))
  expect(new Set(hues).size).toBe(12)
  for (let i = 1; i < hues.length; i++) {
    const apart = Math.abs(hues[i]! - hues[i - 1]!)
    expect(Math.min(apart, 360 - apart)).toBeGreaterThanOrEqual(20)
  }
})

test('hues stay food colours: no purples or magentas', () => {
  for (let id = 0; id < 500; id++) {
    const hue = plateHue(id)
    expect(hue >= 340 || hue <= 125).toBe(true)
  }
})

test('text ids vary too', () => {
  const hues = new Set(['r1', 'r2', 'r3', 'r4', 'r5'].map(plateHue))
  expect(hues.size).toBe(5)
})

test('the dish follows the id, one of four', () => {
  expect([1, 2, 3, 4].map(plateDish)).toEqual([1, 2, 3, 0])
  expect(plateDish('r1')).toBe(plateDish('r1'))
})

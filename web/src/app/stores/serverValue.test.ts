import { expect, test } from 'vitest'
import { createServerValue } from './serverValue'

// The parts the units and preferences tests don't reach: a set after a
// save, invalidate, and the check that ends at a reset.

const EMPTY = { names: [] as string[], loading: false, failed: false }

function counting(answers: string[][]) {
  let calls = 0
  const value = createServerValue(EMPTY, async () => ({ names: answers[calls++] ?? [] }))
  return { value, calls: () => calls }
}

test('a set counts as loaded, so the next load does not fetch', async () => {
  const { value, calls } = counting([['fetched']])
  value.set({ names: ['saved'] })
  await value.load()
  expect(value.getSnapshot()).toEqual({ names: ['saved'], loading: false, failed: false })
  expect(calls()).toBe(0)
})

test('after invalidate the next load fetches again, keeping the value meanwhile', async () => {
  const { value, calls } = counting([['first'], ['second']])
  await value.load()
  value.invalidate()
  expect(value.getSnapshot().names).toEqual(['first'])
  await value.load()
  expect(value.getSnapshot().names).toEqual(['second'])
  expect(calls()).toBe(2)
})

test('a load in flight at invalidate does not fill the state', async () => {
  let answer: (names: string[]) => void = () => {}
  const value = createServerValue(EMPTY, () => new Promise<{ names: string[] }>((resolve) => (answer = (names) => resolve({ names }))))
  const old = value.load()
  value.invalidate()
  answer(['stale'])
  await old
  expect(value.getSnapshot()).toEqual(EMPTY)
})

test('untilReset holds until the next reset only', () => {
  const { value } = counting([])
  const current = value.untilReset()
  value.invalidate()
  expect(current()).toBe(true)
  value.reset()
  expect(current()).toBe(false)
})

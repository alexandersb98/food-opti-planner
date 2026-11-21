import { afterEach, expect, test } from 'vitest'
import { unitChange } from '../../test-data'
import { unitChangeQuestion } from './unitChangeQuestion'

// A port of the Vue unit-change composable test
// (src/composables/useUnitChange.test.ts) to the neutral store.

afterEach(() => unitChangeQuestion.reset())

const request = { name: 'Iron', from: 'mg', to: 'µg', change: unitChange() }

test('the question is open until answered, and resolves with the answer', async () => {
  const yes = unitChangeQuestion.ask(request)
  expect(unitChangeQuestion.getSnapshot()).toBe(request)
  unitChangeQuestion.answer(true)
  await expect(yes).resolves.toBe(true)
  expect(unitChangeQuestion.getSnapshot()).toBeNull()

  const no = unitChangeQuestion.ask(request)
  unitChangeQuestion.answer(false)
  await expect(no).resolves.toBe(false)
})

test('a second question settles the first as no', async () => {
  const first = unitChangeQuestion.ask(request)
  const second = unitChangeQuestion.ask({ ...request, name: 'Zinc' })
  await expect(first).resolves.toBe(false)
  expect(unitChangeQuestion.getSnapshot()?.name).toBe('Zinc')
  unitChangeQuestion.answer(true)
  await expect(second).resolves.toBe(true)
  expect(unitChangeQuestion.getSnapshot()).toBeNull()
})

test('subscribers hear the question open and close', () => {
  const seen: unknown[] = []
  const stop = unitChangeQuestion.subscribe(() => seen.push(unitChangeQuestion.getSnapshot()?.name ?? null))
  void unitChangeQuestion.ask(request)
  unitChangeQuestion.answer(true)
  stop()
  expect(seen).toEqual(['Iron', null])
})

test('a reset settles an open question as no', async () => {
  const asked = unitChangeQuestion.ask(request)
  unitChangeQuestion.reset()
  await expect(asked).resolves.toBe(false)
  expect(unitChangeQuestion.getSnapshot()).toBeNull()
})

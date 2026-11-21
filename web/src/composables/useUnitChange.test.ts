import { afterEach, expect, test } from 'vitest'
import { unitChange } from '../test-data'
import { useUnitChange } from './useUnitChange'

afterEach(() => useUnitChange().answer(false))

test('a second question settles the first as no', async () => {
  const { ask, state } = useUnitChange()
  const request = { name: 'Iron', from: 'mg', to: 'µg', change: unitChange() }
  const first = ask(request)
  const second = ask({ ...request, name: 'Zinc' })
  await expect(first).resolves.toBe(false)
  expect(state.value?.request.name).toBe('Zinc')
  useUnitChange().answer(true)
  await expect(second).resolves.toBe(true)
  expect(state.value).toBeNull()
})

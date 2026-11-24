import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import { loadAll } from '../../load'
import { useLoad } from './useLoad'

/** A call whose answers the test hands out one by one, in any order. */
function deferredCalls<T>() {
  const pending: Array<{ resolve: (answer: { data?: T }) => void; reject: (error: unknown) => void; signal: AbortSignal }> = []
  const call = vi.fn(
    (signal: AbortSignal) =>
      new Promise<{ data?: T }>((resolve, reject) => {
        pending.push({ resolve, reject, signal })
      }),
  )
  return { call, pending }
}

/** Lets every settled answer reach the hook. */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

test('starts loading, then shows the data', async () => {
  const { result } = renderHook(() => useLoad(async () => ({ data: ['oats'] })))
  expect(result.current).toMatchObject({ loading: true, failed: false, data: undefined })

  await waitFor(() => expect(result.current.data).toEqual(['oats']))
  expect(result.current).toMatchObject({ loading: false, failed: false })
})

test('runs several calls in parallel through loadAll', async () => {
  const tags = deferredCalls<string[]>()
  const groups = deferredCalls<string[]>()
  const { result } = renderHook(() =>
    useLoad((signal) => loadAll({ tags: tags.call(signal), groups: groups.call(signal) })),
  )

  // Both calls are out before either answers: no waterfall.
  await waitFor(() => expect(groups.call).toHaveBeenCalledTimes(1))
  expect(tags.call).toHaveBeenCalledTimes(1)
  act(() => {
    groups.pending[0]!.resolve({ data: ['Diet'] })
    tags.pending[0]!.resolve({ data: ['Fish'] })
  })

  await waitFor(() => expect(result.current.data).toEqual({ tags: ['Fish'], groups: ['Diet'] }))
})

test('fails on an answer without data, or a thrown error, and tries again', async () => {
  const { call, pending } = deferredCalls<string>()
  const { result } = renderHook(() => useLoad(call))
  await waitFor(() => expect(pending).toHaveLength(1))

  act(() => pending[0]!.resolve({}))
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.loading).toBe(false)

  act(() => result.current.reload())
  expect(result.current).toMatchObject({ loading: true, failed: false })
  await waitFor(() => expect(pending).toHaveLength(2))
  act(() => pending[1]!.reject(new TypeError('Failed to fetch')))
  await waitFor(() => expect(result.current.failed).toBe(true))

  act(() => result.current.reload())
  await waitFor(() => expect(pending).toHaveLength(3))
  act(() => pending[2]!.resolve({ data: 'back' }))
  await waitFor(() => expect(result.current.data).toBe('back'))
  expect(result.current).toMatchObject({ loading: false, failed: false })
})

test('ignores an answer that arrives after the page left', async () => {
  const { call, pending } = deferredCalls<string>()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { result, unmount } = renderHook(() => useLoad(call))
  await waitFor(() => expect(pending).toHaveLength(1))

  unmount()
  expect(pending[0]!.signal.aborted).toBe(true)
  act(() => pending[0]!.resolve({ data: 'late' }))
  await flush()

  expect(result.current.data).toBeUndefined()
  expect(errors).not.toHaveBeenCalled()
  errors.mockRestore()
})

test('a newer load wins over an older answer that arrives last', async () => {
  const { call, pending } = deferredCalls<string>()
  const { result } = renderHook(() => useLoad(call))
  await waitFor(() => expect(pending).toHaveLength(1))

  act(() => result.current.reload())
  await waitFor(() => expect(pending).toHaveLength(2))
  act(() => pending[1]!.resolve({ data: 'new' }))
  await waitFor(() => expect(result.current.data).toBe('new'))
  act(() => pending[0]!.resolve({ data: 'old' }))
  await flush()

  expect(result.current.data).toBe('new')
})

test('a new key loads again and never shows the old key’s data', async () => {
  const { call, pending } = deferredCalls<string>()
  const { result, rerender } = renderHook(({ id }) => useLoad(() => call(new AbortController().signal), id), {
    initialProps: { id: 1 },
  })
  await waitFor(() => expect(pending).toHaveLength(1))
  act(() => pending[0]!.resolve({ data: 'recipe 1' }))
  await waitFor(() => expect(result.current.data).toBe('recipe 1'))

  rerender({ id: 2 })
  expect(result.current).toMatchObject({ loading: true, data: undefined })
  await waitFor(() => expect(pending).toHaveLength(2))
  act(() => pending[1]!.resolve({ data: 'recipe 2' }))

  await waitFor(() => expect(result.current.data).toBe('recipe 2'))
})

test('strict mode runs the call twice but shows only the answer to the second', async () => {
  const { call, pending } = deferredCalls<string>()
  const { result } = renderHook(() => useLoad(call), { wrapper: StrictMode })
  await waitFor(() => expect(pending).toHaveLength(2))
  expect(pending[0]!.signal.aborted).toBe(true)

  act(() => pending[1]!.resolve({ data: 'fresh' }))
  await waitFor(() => expect(result.current.data).toBe('fresh'))
  act(() => pending[0]!.resolve({ data: 'stale' }))
  await flush()

  expect(result.current.data).toBe('fresh')
})

test('setData changes the loaded data in place', async () => {
  const { result } = renderHook(() => useLoad(async () => ({ data: { name: 'Oats' } })))
  act(() => result.current.setData({ name: 'ignored before data' }))
  await waitFor(() => expect(result.current.data).toEqual({ name: 'Oats' }))

  act(() => result.current.setData((recipe) => ({ ...recipe, name: 'Porridge' })))

  expect(result.current.data).toEqual({ name: 'Porridge' })
})

/** A cached answer: `data` at once, and a refresh the test hands out. */
function cached<T>(data: T) {
  let refresh: (update: ((shown: T) => T) | undefined) => void = () => {}
  const refreshed = new Promise<((shown: T) => T) | undefined>((resolve) => (refresh = resolve))
  return { answer: Promise.resolve({ data, refreshed }), refresh }
}

test('a cached answer shows at once, then its refresh replaces it', async () => {
  const tags = cached(['Fish'])
  const { result } = renderHook(() => useLoad(() => tags.answer))
  await waitFor(() => expect(result.current.data).toEqual(['Fish']))
  tags.refresh(() => ['Fish', 'Quick'])
  await waitFor(() => expect(result.current.data).toEqual(['Fish', 'Quick']))
  expect(result.current).toMatchObject({ loading: false, failed: false })
})

test('through loadAll a refresh changes its own part only, keeping a change made since', async () => {
  const tags = cached(['Fish'])
  const { result } = renderHook(() => useLoad(() => loadAll({ tags: tags.answer, recipe: Promise.resolve({ data: 'Soup' }) })))
  await waitFor(() => expect(result.current.data).toEqual({ tags: ['Fish'], recipe: 'Soup' }))
  act(() => result.current.setData((data) => ({ ...data, recipe: 'Stew' })))
  tags.refresh(() => ['Quick'])
  await waitFor(() => expect(result.current.data).toEqual({ tags: ['Quick'], recipe: 'Stew' }))
})

test('a refresh that comes after a reload is ignored', async () => {
  const first = cached(['old'])
  const call = vi.fn().mockReturnValueOnce(first.answer).mockResolvedValue({ data: ['reloaded'] })
  const { result } = renderHook(() => useLoad(call))
  await waitFor(() => expect(result.current.data).toEqual(['old']))
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.data).toEqual(['reloaded']))
  first.refresh(() => ['late'])
  await flush()
  expect(result.current.data).toEqual(['reloaded'])
})

test('within a group the data shown stays while a new key loads, and when it fails', async () => {
  const { call, pending } = deferredCalls<string>()
  const { result, rerender } = renderHook(({ id, group }) => useLoad(call, id, { group }), {
    initialProps: { id: 'oats', group: 'usda' },
  })
  await waitFor(() => expect(pending).toHaveLength(1))
  act(() => pending[0]!.resolve({ data: 'oats foods' }))
  await waitFor(() => expect(result.current.data).toBe('oats foods'))

  rerender({ id: 'rice', group: 'usda' })
  expect(result.current).toMatchObject({ loading: true, data: 'oats foods' })
  await waitFor(() => expect(pending).toHaveLength(2))
  act(() => pending[1]!.resolve({}))
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.data).toBe('oats foods')
})

test('a new key of another group starts empty, even when it fails', async () => {
  const { call, pending } = deferredCalls<string>()
  const { result, rerender } = renderHook(({ id, group }) => useLoad(call, id, { group }), {
    initialProps: { id: 'usda:oats', group: 'usda' },
  })
  await waitFor(() => expect(pending).toHaveLength(1))
  act(() => pending[0]!.resolve({ data: 'oats foods' }))
  await waitFor(() => expect(result.current.data).toBe('oats foods'))

  rerender({ id: 'other:oats', group: 'other' })
  expect(result.current.data).toBeUndefined()
  await waitFor(() => expect(pending).toHaveLength(2))
  act(() => pending[1]!.resolve({}))
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.data).toBeUndefined()
})

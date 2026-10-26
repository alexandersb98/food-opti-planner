import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { makeRouter } from './router'
import { resetSolve, useSolve } from './solve'
import { fakeServer, type FakeReply } from './test-app'
import { planResult } from './test-data'

afterEach(() => {
  resetSolve()
  vi.unstubAllGlobals()
})

/** The solve store as a page sees it, with the router at `path`. */
async function store(path: string) {
  const router = makeRouter(createMemoryHistory())
  await router.push(path)
  let solve!: ReturnType<typeof useSolve>
  mount(
    defineComponent({
      setup() {
        solve = useSolve()
        return () => null
      },
    }),
    { global: { plugins: [router] } },
  )
  return { solve, router }
}

/** A solve that answers when `answer` is called (once the request is in). */
function slowSolve(cancel: FakeReply = 204) {
  let answer!: (reply: FakeReply) => void
  const calls = fakeServer({
    'GET /api/session': 204,
    'POST /api/plan/solve': () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    'POST /api/plan/solve/cancel': cancel,
  })
  return {
    calls,
    async answer(reply: FakeReply) {
      await flushPromises()
      answer(reply)
    },
  }
}

test('one solve runs at a time, and the store knows when it started', async () => {
  const { calls, answer } = slowSolve()
  const { solve } = await store('/recipes')
  const before = Date.now()
  const first = solve.start(30)
  expect(solve.running.value).toBe(true)
  expect(solve.startedAt.value).toBeGreaterThanOrEqual(before)
  expect(solve.seconds.value).toBe(30)
  void solve.start(30)
  await flushPromises()
  expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(1)
  await answer({ body: { plan: planResult({ id: 1, saved: false }), failure: null } })
  await first
  expect(solve.running.value).toBe(false)
  expect(solve.startedAt.value).toBeNull()
  expect(solve.failure.value).toBeNull()
})

test('a plan opens the results from the Plan page', async () => {
  const { answer } = slowSolve()
  const { solve, router } = await store('/')
  const solving = solve.start(30)
  await answer({ body: { plan: planResult({ id: 1, saved: false }), failure: null } })
  await solving
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/plans/new')
})

test('a plan does not move a user who left the Plan page', async () => {
  const { answer } = slowSolve()
  const { solve, router } = await store('/')
  const solving = solve.start(30)
  await router.push('/recipes')
  await answer({ body: { plan: planResult({ id: 1, saved: false }), failure: null } })
  await solving
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/recipes')
})

test('a failure is kept until dismissed or another solve starts', async () => {
  const { answer } = slowSolve()
  const { solve, router } = await store('/')
  const solving = solve.start(45)
  await answer({ body: { plan: null, failure: 'no_plan_in_time' } })
  await solving
  expect(solve.failure.value).toBe('no_plan_in_time')
  expect(solve.seconds.value).toBe(45)
  expect(router.currentRoute.value.fullPath).toBe('/')
  solve.dismiss()
  expect(solve.failure.value).toBeNull()

  fakeServer({ 'POST /api/plan/solve': { body: { plan: null, failure: 'infeasible' } } })
  await solve.start(30)
  expect(solve.failure.value).toBe('infeasible')
  fakeServer({ 'POST /api/plan/solve': () => new Promise<FakeReply>(() => {}) })
  void solve.start(30)
  expect(solve.failure.value).toBeNull()
})

test('a solve the server fails, or that cannot reach it, is a failure too', async () => {
  fakeServer({ 'GET /api/session': 204, 'POST /api/plan/solve': 500 })
  const { solve } = await store('/')
  await solve.start(30)
  expect(solve.failure.value).toBe('error')
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  await solve.start(30)
  expect(solve.failure.value).toBe('error')
  expect(solve.running.value).toBe(false)
})

test('cancel is sent once, and the store is cancelling until the solve answers', async () => {
  const { calls, answer } = slowSolve()
  const { solve } = await store('/recipes')
  await solve.cancel()
  expect(calls).not.toContain('POST /api/plan/solve/cancel')
  const solving = solve.start(30)
  await solve.cancel()
  await solve.cancel()
  expect(solve.cancelling.value).toBe(true)
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(1)
  await answer({ body: { plan: null, failure: 'stopped' } })
  await solving
  expect(solve.cancelling.value).toBe(false)
  expect(solve.failure.value).toBe('stopped')
})

test('a cancel the server fails can be tried again', async () => {
  const { calls, answer } = slowSolve(500)
  const { solve } = await store('/recipes')
  const solving = solve.start(30)
  await solve.cancel()
  expect(solve.cancelling.value).toBe(false)
  await solve.cancel()
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(2)
  await answer({ body: { plan: null, failure: 'infeasible' } })
  await solving
})

test('a solve already running on the server is busy', async () => {
  fakeServer({ 'GET /api/session': 204, 'POST /api/plan/solve': { status: 409, body: { detail: 'busy' } } })
  const { solve } = await store('/')
  await solve.start(30)
  expect(solve.failure.value).toBe('busy')
})

test('cancel names the solve it means, and each solve is named anew', async () => {
  const named: { solve: string[]; cancel: string[] } = { solve: [], cancel: [] }
  const id = (body: unknown) => (body as { solve_id: string }).solve_id
  let answer!: (reply: FakeReply) => void
  fakeServer({
    'GET /api/session': 204,
    'POST /api/plan/solve': (body) => {
      named.solve.push(id(body))
      return new Promise<FakeReply>((resolve) => (answer = resolve))
    },
    'POST /api/plan/solve/cancel': (body) => {
      named.cancel.push(id(body))
      return 204
    },
  })
  const { solve } = await store('/recipes')

  // The name is the solve's from the click, before the server has it: a
  // Cancel can reach the server first, and must still name this solve.
  const first = solve.start(30)
  await solve.cancel()
  await flushPromises()
  expect(named.cancel).toEqual([named.solve[0]])
  answer({ body: { plan: null, failure: 'stopped' } })
  await first

  const second = solve.start(30)
  await solve.cancel()
  await flushPromises()
  expect(named.solve[1]).not.toBe(named.solve[0])
  expect(named.cancel).toEqual([named.solve[0], named.solve[1]])
  answer({ body: { plan: null, failure: 'stopped' } })
  await second
})

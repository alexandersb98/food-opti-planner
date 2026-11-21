import { afterEach, expect, test, vi } from 'vitest'
import { fakeServer, type FakeReply } from '../../test-server'
import { planResult } from '../../test-data'
import * as solve from './solve'

// The Vue solve store's tests (src/solve.test.ts), ported to the neutral
// store. Where the Vue store navigated, this one reports the outcome.

afterEach(() => {
  solve.reset()
  vi.unstubAllGlobals()
})

/** Let pending requests and their answers run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

/** A solve that answers when `answer` is called (once the request is in). */
function slowSolve(cancel: FakeReply = 204) {
  let answer!: (reply: FakeReply) => void
  const calls = fakeServer({
    'POST /api/plan/solve': () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    'POST /api/plan/solve/cancel': cancel,
  })
  return {
    calls,
    async answer(reply: FakeReply) {
      await flush()
      answer(reply)
    },
  }
}

test('one solve runs at a time, and the store knows when it started', async () => {
  const { calls, answer } = slowSolve()
  const before = Date.now()
  const first = solve.start(30)
  expect(solve.getSnapshot().running).toBe(true)
  expect(solve.getSnapshot().startedAt).toBeGreaterThanOrEqual(before)
  expect(solve.getSnapshot().seconds).toBe(30)
  expect(await solve.start(30)).toBeNull()
  await flush()
  expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(1)
  const made = planResult({ id: 1, saved: false })
  await answer({ body: { plan: made, failure: null } })
  expect(await first).toEqual({ plan: made, failure: null })
  expect(solve.getSnapshot()).toMatchObject({ running: false, startedAt: null, failure: null })
})

test('subscribers hear each change, and the snapshot is stable between changes', async () => {
  const { answer } = slowSolve()
  const heard = vi.fn()
  const unsubscribe = solve.subscribe(heard)
  const idle = solve.getSnapshot()
  expect(solve.getSnapshot()).toBe(idle)
  const solving = solve.start(30)
  expect(heard).toHaveBeenCalledTimes(1)
  expect(solve.getSnapshot()).not.toBe(idle)
  await answer({ body: { plan: null, failure: 'stopped' } })
  await solving
  expect(heard).toHaveBeenCalledTimes(2)
  unsubscribe()
  solve.dismiss()
  expect(heard).toHaveBeenCalledTimes(2)
})

test('a failure is reported, and kept until dismissed or another solve starts', async () => {
  const { answer } = slowSolve()
  const solving = solve.start(45)
  await answer({ body: { plan: null, failure: 'no_plan_in_time' } })
  expect(await solving).toEqual({ plan: null, failure: 'no_plan_in_time' })
  expect(solve.getSnapshot().failure).toBe('no_plan_in_time')
  expect(solve.getSnapshot().seconds).toBe(45)
  solve.dismiss()
  expect(solve.getSnapshot().failure).toBeNull()

  fakeServer({ 'POST /api/plan/solve': { body: { plan: null, failure: 'infeasible' } } })
  expect(await solve.start(30)).toEqual({ plan: null, failure: 'infeasible' })
  expect(solve.getSnapshot().failure).toBe('infeasible')
  fakeServer({ 'POST /api/plan/solve': () => new Promise<FakeReply>(() => {}) })
  void solve.start(30)
  expect(solve.getSnapshot().failure).toBeNull()
})

test('a clash is kept with its failure until dismissed or the next solve', async () => {
  const clash = [{ kind: 'goal' as const, goal_id: 3, name: 'Energy per day', day: 0, date: '2026-10-26' }]
  fakeServer({
    'POST /api/plan/solve': { body: { plan: null, failure: 'infeasible', clash, clash_minimal: false } },
  })
  await solve.start(30)
  expect(solve.getSnapshot()).toMatchObject({ failure: 'infeasible', clash, clashMinimal: false })
  solve.dismiss()
  expect(solve.getSnapshot().clash).toBeNull()

  await solve.start(30)
  expect(solve.getSnapshot().clash).toEqual(clash)
  fakeServer({ 'POST /api/plan/solve': () => new Promise<FakeReply>(() => {}) })
  void solve.start(30)
  expect(solve.getSnapshot().clash).toBeNull()
})

test('a solve the server fails, or that cannot reach it, is a failure too', async () => {
  fakeServer({ 'POST /api/plan/solve': 500 })
  expect(await solve.start(30)).toEqual({ plan: null, failure: 'error' })
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  expect(await solve.start(30)).toEqual({ plan: null, failure: 'error' })
  expect(solve.getSnapshot().running).toBe(false)
})

test('cancel is sent once, and the store is cancelling until the solve answers', async () => {
  const { calls, answer } = slowSolve()
  await solve.cancel()
  expect(calls).not.toContain('POST /api/plan/solve/cancel')
  const solving = solve.start(30)
  await solve.cancel()
  await solve.cancel()
  expect(solve.getSnapshot().cancelling).toBe(true)
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(1)
  await answer({ body: { plan: null, failure: 'stopped' } })
  await solving
  expect(solve.getSnapshot().cancelling).toBe(false)
  expect(solve.getSnapshot().failure).toBe('stopped')
})

test('a cancel the server fails can be tried again', async () => {
  const { calls, answer } = slowSolve(500)
  const solving = solve.start(30)
  await solve.cancel()
  expect(solve.getSnapshot().cancelling).toBe(false)
  await solve.cancel()
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(2)
  await answer({ body: { plan: null, failure: 'infeasible' } })
  await solving
})

test('a solve already running on the server is busy', async () => {
  fakeServer({ 'POST /api/plan/solve': { status: 409, body: { detail: 'busy' } } })
  expect(await solve.start(30)).toEqual({ plan: null, failure: 'busy' })
  expect(solve.getSnapshot().failure).toBe('busy')
})

test('cancel names the solve it means, and each solve is named anew', async () => {
  const named: { solve: string[]; cancel: string[] } = { solve: [], cancel: [] }
  const id = (body: unknown) => (body as { solve_id: string }).solve_id
  let answer!: (reply: FakeReply) => void
  fakeServer({
    'POST /api/plan/solve': (body) => {
      named.solve.push(id(body))
      return new Promise<FakeReply>((resolve) => (answer = resolve))
    },
    'POST /api/plan/solve/cancel': (body) => {
      named.cancel.push(id(body))
      return 204
    },
  })

  // The name is the solve's from the click, before the server has it: a
  // Cancel can reach the server first, and must still name this solve.
  const first = solve.start(30)
  await solve.cancel()
  await flush()
  expect(named.cancel).toEqual([named.solve[0]])
  answer({ body: { plan: null, failure: 'stopped' } })
  await first

  const second = solve.start(30)
  await solve.cancel()
  await flush()
  expect(named.solve[1]).not.toBe(named.solve[0])
  expect(named.cancel).toEqual([named.solve[0], named.solve[1]])
  answer({ body: { plan: null, failure: 'stopped' } })
  await second
})

test('a cancel that crosses the answer does not touch the next solve', async () => {
  let answer!: (reply: FakeReply) => void
  let cancelled!: (reply: FakeReply) => void
  fakeServer({
    'POST /api/plan/solve': () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    'POST /api/plan/solve/cancel': () => new Promise<FakeReply>((resolve) => (cancelled = resolve)),
  })
  const first = solve.start(30)
  const cancelling = solve.cancel()
  await flush()
  answer({ body: { plan: null, failure: 'stopped' } })
  await first
  const second = solve.start(30)
  await flush()
  cancelled(500) // the first solve's Cancel fails after the next solve started
  await cancelling
  expect(solve.getSnapshot()).toMatchObject({ running: true, cancelling: false })
  void solve.cancel() // left unanswered
  expect(solve.getSnapshot().cancelling).toBe(true)
  answer({ body: { plan: null, failure: 'stopped' } })
  await second
})

test('an answer from before a reset is ignored', async () => {
  const { answer } = slowSolve()
  const solving = solve.start(30)
  solve.reset()
  expect(solve.getSnapshot()).toMatchObject({ running: false, startedAt: null, seconds: 0 })
  await answer({ body: { plan: null, failure: 'infeasible', clash: [] } })
  expect(await solving).toBeNull()
  expect(solve.getSnapshot()).toMatchObject({ running: false, failure: null, clash: null })
})

import { afterEach, expect, test, vi } from 'vitest'
import type { Plan, PlanFields } from '../../api/types'
import { fakeServer, type FakeReply } from '../../test-server'
import { goal, plan } from '../../test-data'
import * as planSetup from './planSetup'

afterEach(() => {
  planSetup.reset()
  vi.unstubAllGlobals()
})

/** Let pending requests and their answers run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

/** A server whose saves answer when the test says so, in the order sent;
 * by default a save answers with the setup it was sent. */
function slowServer(loaded: Plan = plan()) {
  const sent: PlanFields[] = []
  const unanswered: { body: PlanFields; resolve: (reply: FakeReply) => void }[] = []
  const calls = fakeServer({
    'GET /api/plan': { body: loaded },
    'PUT /api/plan': (body) => {
      sent.push(body as PlanFields)
      return new Promise<FakeReply>((resolve) => unanswered.push({ body: body as PlanFields, resolve }))
    },
  })
  return {
    calls,
    sent,
    /** Answer the oldest unanswered save (once it is in). */
    async answer(reply?: FakeReply) {
      await flush()
      const { body, resolve } = unanswered.shift()!
      resolve(reply ?? { body })
      await flush()
    },
  }
}

const days = (days: number) => (setup: Plan) => ({ ...setup, days })
const seconds = (solve_time_limit: number) => (setup: Plan) => ({ ...setup, solve_time_limit })
const skip = (day: number, meal: number) => (setup: Plan) => ({ ...setup, skips: [...setup.skips, { day, meal }] })

test('the setup loads, and subscribers hear it', async () => {
  fakeServer({ 'GET /api/plan': { body: plan({ days: 5 }) } })
  const heard = vi.fn()
  planSetup.subscribe(heard)
  const loading = planSetup.load()
  expect(planSetup.getSnapshot()).toMatchObject({ plan: null, loading: true })
  await loading
  expect(planSetup.getSnapshot()).toMatchObject({ plan: plan({ days: 5 }), loading: false, failed: false })
  expect(heard).toHaveBeenCalled()
  const snapshot = planSetup.getSnapshot()
  expect(planSetup.getSnapshot()).toBe(snapshot)
})

test('a failed load says so', async () => {
  fakeServer({ 'GET /api/plan': 500 })
  await planSetup.load()
  expect(planSetup.getSnapshot()).toMatchObject({ plan: null, loading: false, failed: true })
})

test('three quick changes show at once and are saved in order, one at a time, each from the latest state', async () => {
  const server = slowServer()
  await planSetup.load()
  const first = planSetup.change(days(5))
  const second = planSetup.change(seconds(60))
  const third = planSetup.change(skip(0, 1))
  expect(planSetup.getSnapshot()).toMatchObject({
    plan: { days: 5, solve_time_limit: 60, skips: [{ day: 0, meal: 1 }] },
    saving: true,
  })
  await flush()
  expect(server.sent).toHaveLength(1) // one at a time

  // The server's answer is the latest state: the next save starts from it.
  const answered = plan({ days: 5, goals: [goal({ id: 9, attribute_id: 1, name: 'Energy per day' })] })
  await server.answer({ body: answered })
  expect(await first).toEqual({ plan: answered, errors: null })
  await server.answer()
  await server.answer()
  await Promise.all([second, third])

  expect(server.sent.map(({ days, solve_time_limit, skips }) => ({ days, solve_time_limit, skips }))).toEqual([
    { days: 5, solve_time_limit: 30, skips: [] },
    { days: 5, solve_time_limit: 60, skips: [] },
    { days: 5, solve_time_limit: 60, skips: [{ day: 0, meal: 1 }] },
  ])
  expect(server.sent[1].goals).toEqual([expect.objectContaining({ id: 9 })])
  expect(server.sent[1].goals[0]).not.toHaveProperty('name') // sent as planFields builds it
  expect(planSetup.getSnapshot()).toMatchObject({ plan: { days: 5, solve_time_limit: 60 }, saving: false })
})

test('a failed save takes back only its own change, and reports it', async () => {
  const server = slowServer()
  await planSetup.load()
  const first = planSetup.change(days(5))
  const second = planSetup.change(seconds(60))
  const third = planSetup.change(skip(2, 3))
  await server.answer()
  await server.answer({ status: 500 })
  expect(await second).toEqual({ plan: null, errors: {} })
  expect(planSetup.getSnapshot().plan).toMatchObject({ days: 5, solve_time_limit: 30, skips: [{ day: 2, meal: 3 }] })
  await server.answer()
  await Promise.all([first, third])
  expect(server.sent[2]).toMatchObject({ days: 5, solve_time_limit: 30, skips: [{ day: 2, meal: 3 }] })
  expect(planSetup.getSnapshot()).toMatchObject({
    plan: { days: 5, solve_time_limit: 30, skips: [{ day: 2, meal: 3 }] },
    saving: false,
  })
})

test('a save that cannot reach the server is taken back too', async () => {
  fakeServer({ 'GET /api/plan': { body: plan() } })
  await planSetup.load()
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  expect(await planSetup.change(days(3))).toEqual({ plan: null, errors: {} })
  expect(planSetup.getSnapshot()).toMatchObject({ plan: plan(), saving: false })
})

test("the server’s field errors come back to the caller", async () => {
  fakeServer({
    'GET /api/plan': { body: plan() },
    'PUT /api/plan': {
      status: 422,
      body: { detail: [{ loc: ['body', 'goals', 0, 'min'], type: 'no_bound', msg: 'no' }] },
    },
  })
  await planSetup.load()
  const result = await planSetup.change((setup) => ({ ...setup, goals: [goal({ id: 1, attribute_id: 1 })] }))
  expect(result).toEqual({ plan: null, errors: { 'goals.0.min': 'no_bound' } })
  expect(planSetup.getSnapshot().plan).toEqual(plan())
})

test('a change that is not optimistic shows once saved', async () => {
  const server = slowServer()
  await planSetup.load()
  const saving = planSetup.change(days(4), { optimistic: false })
  expect(planSetup.getSnapshot()).toMatchObject({ plan: { days: 7 }, saving: true })
  await server.answer()
  await saving
  expect(planSetup.getSnapshot()).toMatchObject({ plan: { days: 4 }, saving: false })
})

test('settled waits for every change asked for so far', async () => {
  const server = slowServer()
  await planSetup.load()
  void planSetup.change(days(5))
  void planSetup.change(days(6))
  let done = false
  const settling = planSetup.settled().then(() => (done = true))
  await server.answer()
  expect(done).toBe(false)
  await server.answer()
  await settling
  expect(planSetup.getSnapshot()).toMatchObject({ plan: { days: 6 }, saving: false })
})

test('nothing is saved before the setup is loaded', async () => {
  const calls = fakeServer({})
  expect(await planSetup.change(days(5))).toEqual({ plan: null, errors: {} })
  expect(calls).toEqual([])
})

test('a load that crosses a save does not undo it', async () => {
  let loaded!: (reply: FakeReply) => void
  fakeServer({ 'GET /api/plan': { body: plan() }, 'PUT /api/plan': (body) => ({ body }) })
  await planSetup.load()
  fakeServer({
    'GET /api/plan': () => new Promise<FakeReply>((resolve) => (loaded = resolve)),
    'PUT /api/plan': (body) => ({ body }),
  })
  const loading = planSetup.load()
  await planSetup.change(days(5))
  await flush()
  loaded({ body: plan() }) // read before the save landed
  await loading
  expect(planSetup.getSnapshot()).toMatchObject({ plan: { days: 5 }, loading: false })
})

test('answers from before a reset are ignored', async () => {
  const server = slowServer()
  await planSetup.load()
  const saving = planSetup.change(days(5))
  const queued = planSetup.change(days(6))
  await flush()
  expect(server.sent).toHaveLength(1)
  planSetup.reset()
  expect(planSetup.getSnapshot()).toEqual({ plan: null, loading: false, failed: false, saving: false })
  await server.answer()
  await Promise.all([saving, queued])
  expect(server.sent).toHaveLength(1) // the change queued behind it is dropped
  expect(planSetup.getSnapshot().plan).toBeNull()
})

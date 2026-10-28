import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PlanFields } from '../api/types'
import { goalFields } from '../plan'
import { resetSolve } from '../solve'
import { button, click, dialog, fakeServer, mountApp, texts, type FakeReply, type FakeServer } from '../test-app'
import { attribute, goal, plan, planResult, planSummary, resultMeal, tag } from '../test-data'

afterEach(() => {
  resetSolve()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: plan() },
    'GET /api/attributes': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'GET /api/tags': { body: [] },
    'POST /api/plan/recipe-count': { body: { usable: 0, total: 0 } },
    ...server,
  })
  const { wrapper, router } = await mountApp('/')
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

/** The Schedule card's dots, a row of 'planned' and 'skipped' per day. */
function dots(wrapper: Wrapper) {
  return wrapper.findAll('.schedule-day').map((day) =>
    day.findAll('.dot').map((dot) => (dot.classes('skipped') ? 'skipped' : 'planned')),
  )
}

/** The time in the open dialog (one closed just now may linger). */
function maxTimeInput() {
  return [...document.querySelectorAll<HTMLInputElement>('.q-dialog input[aria-label="Max solving time"]')].at(-1)!
}

async function typeMaxTime(text: string) {
  const input = maxTimeInput()
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

test('the Schedule card shows the dates, the meals a day, the skipped meals and a dot per meal', async () => {
  const { wrapper } = await mountPage({
    'GET /api/plan': {
      body: plan({
        days: 4,
        skips: [
          { day: 1, meal: 2 },
          { day: 3, meal: 0 },
        ],
      }),
    },
  })
  expect(wrapper.get('h1').text()).toBe('Plan')
  const card = wrapper.get('.schedule-card')
  expect(card.text()).toContain('Schedule')
  expect(card.get('.schedule-summary').text()).toBe('Mon 21 – Thu 24 Sep · 3 meals a day · 2 skipped')
  expect(wrapper.findAll('.schedule-day').map((day) => day.get('.weekday').text())).toEqual(['M', 'T', 'W', 'T'])
  expect(dots(wrapper)).toEqual([
    ['planned', 'planned', 'planned'],
    ['planned', 'planned', 'skipped'],
    ['planned', 'planned', 'planned'],
    ['skipped', 'planned', 'planned'],
  ])
  wrapper.unmount()
})

test('a one-meal plan with nothing skipped says so', async () => {
  const { wrapper } = await mountPage({
    'GET /api/plan': { body: plan({ start_date: '2026-10-26', meals: [{ id: 4, name: 'Dinner' }] }) },
  })
  expect(wrapper.get('.schedule-summary').text()).toBe('Mon 26 Oct – Sun 1 Nov · 1 meal a day · nothing skipped')
  expect(dots(wrapper)).toHaveLength(7)
  wrapper.unmount()
})

test('Edit on the Schedule card opens the schedule', async () => {
  const { wrapper, router } = await mountPage()
  await click(wrapper.get('.schedule-card a'))
  expect(router.currentRoute.value.fullPath).toBe('/plan/schedule')
  wrapper.unmount()
})

test('the Goals card follows the Schedule card, and a goal opens its editor, whose Save updates the card', async () => {
  const stored = plan({ goals: [goal({ id: 4, attribute_id: 1, min: '120', importance: 2 })] })
  const sent: { goals: unknown[] }[] = []
  const { wrapper } = await mountPage({
    'GET /api/plan': { body: stored },
    'GET /api/attributes': { body: [attribute({ id: 1, name: 'Protein', unit: 'g' })] },
    'PUT /api/plan': (body) => {
      sent.push(body as { goals: unknown[] })
      return { body: { ...stored, goals: [{ ...stored.goals[0]!, min: '150' }] } }
    },
  })
  const cards = wrapper.findAll('.schedule-card, .goals-card').map((card) => card.classes().find((c) => c.endsWith('-card') && c !== 'q-card'))
  expect(cards).toEqual(['schedule-card', 'goals-card'])
  expect(wrapper.get('.goal-row').text()).toMatch(/^Protein\s*at least 120 g\s*Each day\s*Prefer/)
  await click(wrapper.get('.goal-row'))
  const min = document.querySelector<HTMLInputElement>('.q-dialog input[aria-label="Min"]')!
  expect(min.value).toBe('120')
  min.value = '150'
  min.dispatchEvent(new Event('input'))
  await dialog().click('Save')
  expect(sent).toHaveLength(1)
  expect(wrapper.get('.goal-range').text()).toBe('at least 150 g')
  wrapper.unmount()
})

test('the Recipes card follows the Goals card, with the count and a chip per filter; Edit opens the filters', async () => {
  const { wrapper, router } = await mountPage({
    'GET /api/plan': { body: plan({ tag_filters: [{ tag_id: 2, mode: 'never' }] }) },
    'GET /api/tags': { body: [tag({ id: 2, name: 'contains-nuts' })] },
    'POST /api/plan/recipe-count': { body: { usable: 5, total: 9 } },
  })
  const cards = wrapper.findAll('.goals-card, .recipes-card').map((card) => card.classes().find((c) => c.endsWith('-card') && c !== 'q-card'))
  expect(cards).toEqual(['goals-card', 'recipes-card'])
  const card = wrapper.get('.recipes-card')
  expect(card.text()).toContain('5 of 9 recipes can be used')
  expect(card.findAll('.filter-chip').map((chip) => chip.text())).toEqual(['Never: contains-nuts'])
  await click(card.get('a'))
  expect(router.currentRoute.value.fullPath).toBe('/plan/recipes')
  wrapper.unmount()
})

test('+ Add goal opens an empty editor; it is disabled without attributes', async () => {
  const { wrapper } = await mountPage({ 'GET /api/attributes': { body: [] } })
  expect(wrapper.get('.add-goal').attributes('disabled')).toBeDefined()
  wrapper.unmount()
  const withAttributes = await mountPage({
    'GET /api/attributes': { body: [attribute({ id: 1, name: 'Protein', unit: 'g' })] },
  })
  await click(withAttributes.wrapper.get('.add-goal'))
  expect(dialog().text).toContain('Add goal')
  withAttributes.wrapper.unmount()
})

test('Max solving time is changed in a dialog, which saves the whole setup', async () => {
  const stored = plan({ skips: [{ day: 2, meal: 1 }], minimums: [{ day: 2, at_least: 1 }] })
  const sent: unknown[] = []
  const { wrapper } = await mountPage({
    'GET /api/plan': { body: stored },
    'PUT /api/plan': (body) => {
      sent.push(body)
      return { body: { ...stored, ...(body as object) } }
    },
  })
  expect(wrapper.get('.max-time').text()).toContain('Max solving time')
  expect(wrapper.get('.max-time').text()).toContain('30 s')
  await click(wrapper.get('.max-time'))
  expect(maxTimeInput().value).toBe('30')
  await typeMaxTime(' 120 ')
  await dialog().click('Save')
  expect(sent).toEqual([{ ...stored, solve_time_limit: 120 }])
  expect(wrapper.get('.max-time').text()).toContain('120 s')
  wrapper.unmount()
})

test('a max solving time out of range is marked and not sent', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.get('.max-time'))
  for (const text of ['0', '301', '2.5', 'soon']) {
    await typeMaxTime(text)
    await dialog().click('Save')
    expect(dialog().text).toContain('A whole number of seconds from 1 to 300.')
  }
  expect(calls).not.toContain('PUT /api/plan')
  wrapper.unmount()
})

test('the server refusing the time marks it, and any other failure says so', async () => {
  const { wrapper } = await mountPage({
    'PUT /api/plan': {
      status: 422,
      body: { detail: [{ loc: ['body', 'solve_time_limit'], type: 'less_than_equal', msg: 'big' }] },
    },
  })
  await click(wrapper.get('.max-time'))
  await typeMaxTime('60')
  await dialog().click('Save')
  expect(dialog().text).toContain('A whole number of seconds from 1 to 300.')

  fakeServer({ 'PUT /api/plan': 500 })
  await dialog().click('Save')
  expect(dialog().text).toContain('Could not save. Try again.')
  expect(wrapper.get('.max-time').text()).toContain('30 s')
  wrapper.unmount()
})

test('Cancel leaves the time as it was', async () => {
  const { wrapper, calls } = await mountPage()
  await click(wrapper.get('.max-time'))
  await typeMaxTime('99')
  await dialog().click('Cancel')
  expect(calls).not.toContain('PUT /api/plan')
  await click(wrapper.get('.max-time'))
  expect(maxTimeInput().value).toBe('30')
  wrapper.unmount()
})

test('a plan that fails to load says so', async () => {
  const { wrapper } = await mountPage({ 'GET /api/plan': 500 })
  expect(wrapper.text()).toContain('Could not load the plan.')
  wrapper.unmount()
})

/** A solve that answers when `answer` is called (once the request is in). */
function slowSolve() {
  let answer!: (reply: FakeReply) => void
  return {
    reply: () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    async answer(reply: FakeReply) {
      await flushPromises()
      answer(reply)
      await flushPromises()
    },
  }
}

function makePlanButton(wrapper: Wrapper) {
  return wrapper.get('button.make-plan')
}

test('Make plan shows the Making plan… card, its bar filling towards Max solving time', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  const solve = slowSolve()
  const { wrapper, calls } = await mountPage({ 'POST /api/plan/solve': solve.reply })
  expect(wrapper.find('.solve-card').exists()).toBe(false)
  expect(makePlanButton(wrapper).text()).toBe('Make plan')
  await click(makePlanButton(wrapper))
  const card = wrapper.get('.solve-card')
  expect(card.text()).toContain('Making plan…')
  expect(card.text()).toContain('0 of 30 s')
  expect(makePlanButton(wrapper).attributes('disabled')).toBeDefined()

  await vi.advanceTimersByTimeAsync(12_000)
  expect(wrapper.get('.solve-card').text()).toContain('12 of 30 s')
  expect(wrapper.get('.solve-card [role="progressbar"]').attributes('aria-valuenow')).toBe('0.4')
  await vi.advanceTimersByTimeAsync(30_000)
  expect(wrapper.get('.solve-card').text()).toContain('42 of 30 s')
  expect(wrapper.get('.solve-card [role="progressbar"]').attributes('aria-valuenow')).toBe('1')

  await solve.answer({ body: { plan: null, failure: 'infeasible' } })
  expect(wrapper.find('.solve-card').exists()).toBe(false)
  expect(makePlanButton(wrapper).attributes('disabled')).toBeUndefined()
  expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(1)
  wrapper.unmount()
})

test('the Making plan… card stays while the user visits other pages', async () => {
  const solve = slowSolve()
  const { wrapper, router } = await mountPage({ 'GET /api/recipes': { body: [] }, 'POST /api/plan/solve': solve.reply })
  await click(makePlanButton(wrapper))
  await router.push('/recipes')
  await flushPromises()
  await router.push('/')
  await flushPromises()
  expect(wrapper.get('.solve-card').text()).toContain('Making plan…')
  await solve.answer({ body: { plan: null, failure: 'infeasible' } })
  wrapper.unmount()
})

test('a plan made opens the results', async () => {
  const made = planResult({ id: 5, saved: false, saved_at: null })
  const { wrapper, router } = await mountPage({
    'POST /api/plan/solve': { body: { plan: made, failure: null } },
    'GET /api/plan-results': { body: { unsaved: planSummary(made), saved: [] } },
    'GET /api/plan-results/5': { body: made },
  })
  await click(makePlanButton(wrapper))
  expect(router.currentRoute.value.fullPath).toBe('/plans/new')
  wrapper.unmount()
})

test.each([
  ['no_plan_in_time', 'No plan found within 45 s. Try a longer Max solving time.'],
  ['infeasible', 'No plan possible with these settings.'],
  ['no_recipes', 'There are no recipes to plan with yet. Add some on the Recipes page.'],
  ['no_usable_recipes', 'No recipe passes the recipe filters. Change them under Recipes.'],
  ['too_large', 'This plan is too large to solve. Try fewer days or meals.'],
  ['stopped', 'Stopped before any plan was found.'],
])('no plan (%s) shows the Couldn’t make a plan card until dismissed', async (failure, text) => {
  const { wrapper, router } = await mountPage({
    'GET /api/plan': { body: plan({ solve_time_limit: 45 }) },
    'POST /api/plan/solve': { body: { plan: null, failure } },
  })
  await click(makePlanButton(wrapper))
  expect(router.currentRoute.value.fullPath).toBe('/')
  const card = wrapper.get('.solve-failed')
  expect(card.text()).toContain('Couldn\'t make a plan')
  expect(card.text()).toContain(text)
  await click(button(wrapper, 'Dismiss'))
  expect(wrapper.find('.solve-failed').exists()).toBe(false)
  wrapper.unmount()
})

test('Cancel stops the solve: Stopping… until it answers, then the plan found opens', async () => {
  const solve = slowSolve()
  const made = planResult({ id: 5, saved: false, saved_at: null, status: 'stopped' })
  const { wrapper, router, calls } = await mountPage({
    'POST /api/plan/solve': solve.reply,
    'POST /api/plan/solve/cancel': 204,
    'GET /api/plan-results/5': { body: made },
  })
  await click(makePlanButton(wrapper))
  await click(button(wrapper, 'Cancel'))
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(1)
  const stopping = button(wrapper, 'Stopping…')
  expect(stopping.attributes('disabled')).toBeDefined()
  await click(stopping)
  expect(calls.filter((call) => call === 'POST /api/plan/solve/cancel')).toHaveLength(1)

  await solve.answer({ body: { plan: made, failure: null } })
  expect(router.currentRoute.value.fullPath).toBe('/plans/new')
  wrapper.unmount()
})

test('a solve already running on the server says so', async () => {
  const { wrapper } = await mountPage({ 'POST /api/plan/solve': { status: 409, body: { detail: 'busy' } } })
  await click(makePlanButton(wrapper))
  expect(wrapper.get('.solve-failed').text()).toContain('A plan is already being made. Try again when it is done.')
  wrapper.unmount()
})

test('a solve the server fails says so', async () => {
  const { wrapper } = await mountPage({ 'POST /api/plan/solve': 500 })
  await click(makePlanButton(wrapper))
  expect(wrapper.get('.solve-failed').text()).toContain('Could not make a plan. Try again.')
  wrapper.unmount()
})

test('the New plan card shows the unsaved plan, and Open opens it', async () => {
  const unsaved = planSummary({ id: 5, saved: false, saved_at: null, status: 'time_ran_out' })
  const { wrapper, router } = await mountPage({
    'GET /api/plan-results': { body: { unsaved, saved: [] } },
    'GET /api/plan-results/5': { body: planResult(unsaved) },
  })
  const card = wrapper.get('.new-plan-card')
  expect(card.text()).toContain('New plan, not saved')
  expect(card.text()).toContain('Mon 21 – Sun 27 Sep · Time ran out')
  await click(wrapper.get('.new-plan-card a'))
  expect(router.currentRoute.value.fullPath).toBe('/plans/new')
  wrapper.unmount()
})

test('without an unsaved plan, a saved plan for today or saved plans, their cards are hidden', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.find('.new-plan-card').exists()).toBe(false)
  expect(wrapper.find('.today-card').exists()).toBe(false)
  expect(wrapper.find('.saved-plans-card').exists()).toBe(false)
  wrapper.unmount()
})

test('the Today card shows today’s meals of the plan used for today, asked for by the browser’s date', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 22, 23, 30)) // Tue 22 Sep, late evening locally
  const today = {
    id: 3,
    day: 1,
    date: '2026-09-22',
    meals: [
      resultMeal({ name: 'Breakfast', planned: true, recipe: 'Oat porridge', portion: '1' }),
      resultMeal({ name: 'Lunch', planned: true, recipe: 'Chili', portion: '1.5' }),
      resultMeal({ name: 'Dinner' }),
    ],
  }
  const { wrapper, router, calls } = await mountPage({
    'GET /api/plan-results/today': { body: today },
    'GET /api/plan-results/3': { body: planResult({ id: 3 }) },
  })
  expect(calls).toContain('GET /api/plan-results/today?date=2026-09-22')
  const card = wrapper.get('.today-card')
  expect(card.text()).toContain('Today · Tue 22')
  expect(texts(wrapper, '.today-meal')).toEqual([
    expect.stringMatching(/^Breakfast\s*Oat porridge · 1 ×$/),
    expect.stringMatching(/^Lunch\s*Chili · 1.5 ×$/),
    expect.stringMatching(/^Dinner\s*skipped$/),
  ])
  await click(wrapper.findAll('.today-meal')[1]!)
  expect(router.currentRoute.value.fullPath).toBe('/plans/3?day=1&meal=1')
  await router.push('/')
  await flushPromises()
  await click(wrapper.findAll('.today-meal')[2]!) // a skipped meal has nothing to open
  expect(router.currentRoute.value.fullPath).toBe('/plans/3?day=1')
  wrapper.unmount()
})

test('saved plans are listed newest first with when they were saved, and the Today chip', async () => {
  const saved = [
    planSummary({ id: 4, saved_at: '2026-09-20T16:04:00Z' }),
    planSummary({ id: 3, start_date: '2026-09-14', saved_at: '2026-09-12T07:30:00Z' }),
    planSummary({ id: 2, start_date: '2026-09-28', days: 3, saved_at: '2026-09-11T22:15:00Z' }),
  ]
  const { wrapper, router } = await mountPage({
    'GET /api/plan-results': { body: { unsaved: null, saved } },
    'GET /api/plan-results/today': { body: { id: 3, day: 0, date: '2026-09-14', meals: [] } },
    'GET /api/plan-results/3': { body: planResult({ id: 3, start_date: '2026-09-14' }) },
  })
  expect(wrapper.get('.saved-plans-card').text()).toContain('Saved plans')
  expect(texts(wrapper, '.saved-plan')).toEqual([
    expect.stringMatching(/^Mon 21 – Sun 27 Sep\s*saved Sun 20, 18:04$/),
    expect.stringMatching(/^Mon 14 – Sun 20 Sep\s*saved Sat 12, 09:30\s*Today$/),
    expect.stringMatching(/^Mon 28 – Wed 30 Sep\s*saved Sat 12, 00:15$/),
  ])
  await click(wrapper.findAll('.saved-plan')[1]!)
  expect(router.currentRoute.value.fullPath).toBe('/plans/3')
  wrapper.unmount()
})

describe('the No plan possible card', () => {
  const energy = attribute({ id: 1, name: 'Energy', unit: 'kcal' })
  const daily = goal({ id: 7, attribute_id: 1, name: 'Energy per day', min: null, max: '50', must: true })
  const other = goal({ id: 8, attribute_id: 1, name: 'Energy, plan total', min: '10', applies_to: 'plan_total' })
  const setup = plan({ goals: [other, daily], minimums: [{ day: 1, at_least: 2 }] })
  const clash = [
    { kind: 'goal', goal_id: 7, name: 'Energy per day', day: 1, date: '2026-09-22' },
    { kind: 'day_minimum', goal_id: null, name: null, day: 1, date: '2026-09-22' },
  ]
  const infeasible = { body: { plan: null, failure: 'infeasible', clash, clash_minimal: true } }

  async function showClash(server: FakeServer = {}) {
    const page = await mountPage({
      'GET /api/plan': { body: setup },
      'GET /api/attributes': { body: [energy] },
      'POST /api/plan/solve': infeasible,
      ...server,
    })
    await click(makePlanButton(page.wrapper))
    return page
  }

  function maxInput(wrapper: Wrapper) {
    return wrapper.get<HTMLInputElement>('.clash-goal input[aria-label="Max"]')
  }

  test('shows each clashing goal and day of meals, and marks the goal red', async () => {
    const { wrapper } = await showClash()
    expect(wrapper.find('.solve-failed').exists()).toBe(false)
    const card = wrapper.get('.clash-card')
    expect(card.text()).toContain('No plan possible')
    expect(card.text()).toContain('Fixing these may show another clash.')
    expect(texts(wrapper, '.clash-goal .clash-where')).toEqual(['Clashes on Tue 22'])
    expect(maxInput(wrapper).element.value).toBe('50')
    expect(wrapper.find('.clash-goal input[aria-label="Min"]').exists()).toBe(false)
    expect(texts(wrapper, '.clash-meals')).toEqual([expect.stringMatching(/^Meals on Tue 22\s*At least 2 meals are served\s*Edit schedule$/)])
    expect(wrapper.findAll('.goal-row').map((row) => row.classes('clashing'))).toEqual([false, true])
    await click(button(wrapper, 'Dismiss'))
    expect(wrapper.find('.clash-card').exists()).toBe(false)
    expect(wrapper.findAll('.goal-row.clashing')).toHaveLength(0)
    wrapper.unmount()
  })

  test('a clash cut short by Cancel says it may hold more', async () => {
    const { wrapper } = await showClash({
      'POST /api/plan/solve': { body: { ...infeasible.body, clash_minimal: false } },
    })
    expect(wrapper.get('.clash-card').text()).toContain('Stopped early: some of these may not take part.')
    wrapper.unmount()
  })

  test('Try again with nothing changed only makes the plan', async () => {
    const { wrapper, calls } = await showClash()
    await click(button(wrapper, 'Try again'))
    expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(2)
    expect(calls).not.toContain('PUT /api/plan')
    wrapper.unmount()
  })

  test('Try again saves a looser bound and Make Prefer, then makes the plan', async () => {
    let sent: PlanFields | null = null
    const { wrapper, calls } = await showClash({
      'PUT /api/plan': (body) => {
        sent = body as PlanFields
        return { body: plan({ ...setup, goals: [other, { ...daily, max: '500', must: false }] }) }
      },
    })
    await maxInput(wrapper).setValue('500')
    await click(button(wrapper, 'Make Prefer'))
    expect(wrapper.get('.clash-goal').text()).toContain('Will be Prefer')
    await click(button(wrapper, 'Keep Must'))
    expect(wrapper.get('.clash-goal').text()).not.toContain('Will be Prefer')
    await click(button(wrapper, 'Make Prefer'))
    await click(button(wrapper, 'Try again'))
    expect(sent!.goals).toEqual([goalFields(other), { ...goalFields(daily), max: '500', must: false }])
    expect(calls.indexOf('PUT /api/plan')).toBeLessThan(calls.lastIndexOf('POST /api/plan/solve'))
    expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(2)
    wrapper.unmount()
  })

  test('a bound that is no number, or one the server refuses, is marked and nothing is made', async () => {
    const { wrapper, calls } = await showClash({
      'PUT /api/plan': { status: 422, body: { detail: [{ loc: ['body', 'goals', 1, 'max'], type: 'too_many_decimals', msg: '' }] } },
    })
    await maxInput(wrapper).setValue('lots')
    await click(button(wrapper, 'Try again'))
    expect(wrapper.get('.clash-goal').text()).toContain('A number, such as 120 or 1.5.')
    expect(calls).not.toContain('PUT /api/plan')

    await maxInput(wrapper).setValue('50.5')
    await click(button(wrapper, 'Try again'))
    expect(wrapper.get('.clash-goal').text()).toContain('At most 0 decimals for Energy.')
    expect(calls.filter((call) => call === 'POST /api/plan/solve')).toHaveLength(1)
    wrapper.unmount()
  })

  test('a goal with only a Max, cleared, is marked on Max', async () => {
    const { wrapper, calls } = await showClash()
    await maxInput(wrapper).setValue('')
    await click(button(wrapper, 'Try again'))
    expect(wrapper.get('.clash-goal').text()).toContain('Give a minimum, a maximum or both.')
    expect(calls).not.toContain('PUT /api/plan')
    wrapper.unmount()
  })

  test('what was typed stays when another part of the setup is saved', async () => {
    const { wrapper } = await showClash({
      'PUT /api/plan': (body) => ({ body: { ...setup, ...(body as PlanFields), goals: setup.goals } }),
    })
    await maxInput(wrapper).setValue('80')
    await click(wrapper.get('.max-time'))
    await typeMaxTime('60')
    await dialog().click('Save')
    expect(maxInput(wrapper).element.value).toBe('80')
    wrapper.unmount()
  })

  test('a save that fails otherwise says so', async () => {
    const { wrapper } = await showClash({ 'PUT /api/plan': 500 })
    await maxInput(wrapper).setValue('80')
    await click(button(wrapper, 'Try again'))
    expect(wrapper.get('.clash-card .save-failed').text()).toBe('Could not save. Try again.')
    wrapper.unmount()
  })

  test('Make Prefer on a bound of 0 asks for the zero-bound field', async () => {
    const zero = { ...daily, max: '0' }
    const { wrapper, calls } = await showClash({ 'GET /api/plan': { body: plan({ ...setup, goals: [other, zero] }) } })
    expect(wrapper.find('.clash-goal .zero-reference').exists()).toBe(false)
    await click(button(wrapper, 'Make Prefer'))
    expect(wrapper.find('.clash-goal .zero-reference').exists()).toBe(true)
    await click(button(wrapper, 'Try again'))
    expect(wrapper.get('.clash-goal').text()).toContain('A number above 0.')
    expect(calls).not.toContain('PUT /api/plan')
    wrapper.unmount()
  })

  test('Edit schedule opens the Schedule page', async () => {
    const { wrapper, router } = await showClash()
    await click(wrapper.get('.clash-meals a'))
    expect(router.currentRoute.value.name).toBe('schedule')
    wrapper.unmount()
  })

  test('with none of its rules left (goal gone, day past the schedule), the card says no plan is possible', async () => {
    const { wrapper } = await showClash({ 'GET /api/plan': { body: plan({ days: 1, goals: [other] }) } })
    expect(wrapper.get('.clash-card').text()).toContain('No plan possible with these settings.')
    wrapper.unmount()
  })
})

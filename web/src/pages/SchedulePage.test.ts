import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { button, click, dialog, fakeServer, field, mountApp, texts, type FakeServer } from '../test-app'
import { plan } from '../test-data'

// Mon 21 to Wed 23 Sep, dinner skipped on Tue 22, at least 2 meals on Mon 21.
const stored = plan({ days: 3, skips: [{ day: 1, meal: 2 }], minimums: [{ day: 0, at_least: 2 }] })

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: stored },
    ...server,
  })
  const { wrapper, router } = await mountApp('/plan/schedule')
  return { wrapper, router, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

/** The grid, a row per day: its label, 'plan' or 'skip' per meal, and At least. */
function grid(wrapper: Wrapper) {
  return wrapper.findAll('.schedule-row').map((row) => [
    row.get('.day-label').text(),
    ...row.findAll('.cell').map((cell) => (cell.attributes('aria-pressed') === 'true' ? 'plan' : 'skip')),
    row.get('.at-least').text(),
  ])
}

function header(wrapper: Wrapper) {
  return texts(wrapper, '.schedule-header > *').filter((text) => text !== '')
}

function cell(wrapper: Wrapper, label: string) {
  return wrapper.get(`button.cell[aria-label="${label}"]`)
}

/** The At least choices of a day, as offered. */
async function atLeastChoices(wrapper: Wrapper, day: string) {
  await click(wrapper.get(`[aria-label="At least on ${day}"]`))
  // The menu just opened; one closed before may linger.
  const menu = [...document.querySelectorAll('.q-menu')].at(-1)!
  return [...menu.querySelectorAll<HTMLElement>('.q-item')]
}

/** The At least choices of a day whose minimum is "all", leaving it so. */
async function choicesAtAll(wrapper: Wrapper, day: string) {
  const choices = await atLeastChoices(wrapper, day)
  const offered = choices.map((item) => item.textContent)
  choices[0]!.click() // "all", closing the menu
  await flushPromises()
  return offered
}

async function chooseAtLeast(wrapper: Wrapper, day: string, choice: string) {
  const choices = await atLeastChoices(wrapper, day)
  const found = choices.find((item) => item.textContent === choice)
  expect(found, `choice ${choice}`).toBeDefined()
  found!.click()
  await flushPromises()
}

/** The meal names dialog's parts. */
function mealsDialog() {
  const root = () => document.querySelector<HTMLElement>('.q-dialog')!
  return {
    names: () => [...root().querySelectorAll<HTMLInputElement>('.meal-row input')].map((input) => input.value),
    async type(n: number, name: string) {
      const input = root().querySelector<HTMLInputElement>(`input[aria-label="Name of meal ${n}"]`)!
      input.value = name
      input.dispatchEvent(new Event('input'))
      await flushPromises()
    },
    control: (label: string) => root().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!,
    async press(label: string) {
      this.control(label).click()
      await flushPromises()
    },
    text: () => root().textContent ?? '',
  }
}

function recorder(status: number) {
  const sent: unknown[] = []
  const handler = (body: unknown) => {
    sent.push(body)
    return { status, body: { ...stored, ...(body as object) } }
  }
  return { sent, handler }
}

test('the schedule opens with the stored setup', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Schedule')
  expect(field(wrapper, 'Starts').element.value).toBe('2026-09-21')
  expect(wrapper.text()).toContain('Mon 21 – Wed 23 Sep')
  expect(field(wrapper, 'Number of days').element.value).toBe('3')
  expect(wrapper.get('.meals-row').text()).toContain('Breakfast, Lunch, Dinner')
  expect(header(wrapper)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'At least'])
  expect(grid(wrapper)).toEqual([
    ['Mon 21', 'plan', 'plan', 'plan', '2'],
    ['Tue 22', 'plan', 'plan', 'skip', 'all'],
    ['Wed 23', 'plan', 'plan', 'plan', 'all'],
  ])
  expect(cell(wrapper, 'Dinner on Tue 22').text()).toBe('skip')
  wrapper.unmount()
})

test('the start date labels the days', async () => {
  const { wrapper } = await mountPage()
  await field(wrapper, 'Starts').setValue('2026-10-30')
  expect(wrapper.text()).toContain('Fri 30 Oct – Sun 1 Nov')
  expect(grid(wrapper).map((row) => row[0])).toEqual(['Fri 30', 'Sat 31', 'Sun 1'])
  wrapper.unmount()
})

test('a start that is not a date is marked and nothing is sent', async () => {
  const { wrapper, calls } = await mountPage()
  await field(wrapper, 'Starts').setValue('2026-02-30')
  expect(grid(wrapper).map((row) => row[0])).toEqual(['Mon 21', 'Tue 22', 'Wed 23'])
  await click(button(wrapper, 'Save'))
  expect(wrapper.text()).toContain('Enter a date, such as 2026-10-21.')
  expect(calls).not.toContain('PUT /api/plan')
  wrapper.unmount()
})

test('the days stepper adds and removes days, from 1 to 31', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.get('[aria-label="More days"]'))
  expect(field(wrapper, 'Number of days').element.value).toBe('4')
  expect(grid(wrapper).map((row) => row[0])).toEqual(['Mon 21', 'Tue 22', 'Wed 23', 'Thu 24'])
  await click(wrapper.get('[aria-label="Fewer days"]'))
  await click(wrapper.get('[aria-label="Fewer days"]'))
  await click(wrapper.get('[aria-label="Fewer days"]'))
  expect(grid(wrapper).map((row) => row[0])).toEqual(['Mon 21'])
  expect(wrapper.get('[aria-label="Fewer days"]').attributes('disabled')).toBeDefined()

  await field(wrapper, 'Number of days').setValue('31')
  expect(wrapper.findAll('.schedule-row')).toHaveLength(31)
  expect(wrapper.get('[aria-label="More days"]').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

test('a number of days out of range is marked and nothing is sent', async () => {
  const { wrapper, calls } = await mountPage()
  for (const text of ['0', '32', 'a week']) {
    await field(wrapper, 'Number of days').setValue(text)
    await click(button(wrapper, 'Save'))
    expect(wrapper.text()).toContain('A whole number from 1 to 31.')
    expect(wrapper.findAll('.schedule-row')).toHaveLength(3)
  }
  expect(calls).not.toContain('PUT /api/plan')
  wrapper.unmount()
})

test('tapping a cell switches it between plan and skip', async () => {
  const { wrapper } = await mountPage()
  await click(cell(wrapper, 'Breakfast on Wed 23'))
  await click(cell(wrapper, 'Dinner on Tue 22'))
  expect(grid(wrapper)).toEqual([
    ['Mon 21', 'plan', 'plan', 'plan', '2'],
    ['Tue 22', 'plan', 'plan', 'plan', 'all'],
    ['Wed 23', 'skip', 'plan', 'plan', 'all'],
  ])
  wrapper.unmount()
})

test('At least offers no more than the meals planned that day', async () => {
  const { wrapper } = await mountPage()
  expect(await choicesAtAll(wrapper, 'Tue 22')).toEqual(['all', '1', '0'])
  await chooseAtLeast(wrapper, 'Wed 23', '1')
  expect(grid(wrapper)[2]).toEqual(['Wed 23', 'plan', 'plan', 'plan', '1'])

  // Skipping down to the minimum leaves no choice to take: every planned meal is served.
  await click(cell(wrapper, 'Lunch on Mon 21'))
  expect(grid(wrapper)[0]).toEqual(['Mon 21', 'plan', 'skip', 'plan', 'all'])
  await click(cell(wrapper, 'Breakfast on Tue 22'))
  await click(cell(wrapper, 'Lunch on Tue 22'))
  expect(await choicesAtAll(wrapper, 'Tue 22')).toEqual(['all'])
  wrapper.unmount()
})

test('meal names are added, renamed, moved and removed, and skipped cells keep their meal', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.get('.meals-row'))
  const meals = mealsDialog()
  expect(meals.names()).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  await meals.type(2, 'Brunch')
  await meals.press('Move Dinner up')
  await meals.press('+ Add meal')
  await meals.type(4, ' Snack ')
  await meals.press('Move Breakfast down')
  expect(meals.names()).toEqual(['Dinner', 'Breakfast', 'Brunch', ' Snack '])
  await meals.press('Remove Brunch')
  expect(meals.names()).toEqual(['Dinner', 'Breakfast', ' Snack '])
  expect(meals.control('Move Dinner up').disabled).toBe(true)
  expect(meals.control('Move Snack down').disabled).toBe(true)
  await dialog().click('Done')

  expect(wrapper.get('.meals-row').text()).toContain('Dinner, Breakfast, Snack')
  expect(header(wrapper)).toEqual(['Dinner', 'Breakfast', 'Snack', 'At least'])
  expect(grid(wrapper)).toEqual([
    ['Mon 21', 'plan', 'plan', 'plan', '2'],
    ['Tue 22', 'skip', 'plan', 'plan', 'all'],
    ['Wed 23', 'plan', 'plan', 'plan', 'all'],
  ])
  wrapper.unmount()
})

test('the last meal can not be removed, and no more than 8 added', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.get('.meals-row'))
  const meals = mealsDialog()
  await meals.press('Remove Breakfast')
  await meals.press('Remove Lunch')
  expect(meals.control('Remove Dinner').disabled).toBe(true)
  for (let n = 2; n <= 8; n++) {
    await meals.press('+ Add meal')
    await meals.type(n, `Meal ${n}`)
  }
  expect(meals.names()).toHaveLength(8)
  expect(meals.control('+ Add meal').disabled).toBe(true)
  expect(meals.text()).toContain('At most 8 meals a day.')
  wrapper.unmount()
})

test('empty and repeated meal names are marked and kept in the dialog', async () => {
  const { wrapper } = await mountPage()
  await click(wrapper.get('.meals-row'))
  const meals = mealsDialog()
  await meals.type(1, '  ')
  await meals.type(3, 'Lunch ')
  await dialog().click('Done')
  expect(meals.text()).toContain('Enter a name.')
  expect(meals.text()).toContain('Another meal has this name.')
  await dialog().click('Cancel')
  await flushPromises()
  expect(wrapper.get('.meals-row').text()).toContain('Breakfast, Lunch, Dinner')
  wrapper.unmount()
})

test('Save sends the setup and returns to the Plan page', async () => {
  const { sent, handler } = recorder(200)
  const { wrapper, router } = await mountPage({ 'PUT /api/plan': handler })
  await field(wrapper, 'Starts').setValue('2026-10-05')
  await click(wrapper.get('[aria-label="More days"]'))
  await click(cell(wrapper, 'Lunch on Thu 8'))
  await chooseAtLeast(wrapper, 'Thu 8', '0')
  await click(wrapper.get('.meals-row'))
  const meals = mealsDialog()
  await meals.press('+ Add meal')
  await meals.type(4, 'Snack')
  await meals.press('Move Snack up')
  await dialog().click('Done')
  await click(cell(wrapper, 'Snack on Mon 5'))
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([
    {
      start_date: '2026-10-05',
      days: 4,
      meals: [
        { id: 1, name: 'Breakfast' },
        { id: 2, name: 'Lunch' },
        { id: null, name: 'Snack' },
        { id: 3, name: 'Dinner' },
      ],
      skips: [
        { day: 0, meal: 2 },
        { day: 1, meal: 3 },
        { day: 3, meal: 1 },
      ],
      minimums: [
        { day: 0, at_least: 2 },
        { day: 3, at_least: 0 },
      ],
      solve_time_limit: 30,
    },
  ])
  expect(router.currentRoute.value.fullPath).toBe('/')
  wrapper.unmount()
})

test('days left out are not sent, and come back as they were', async () => {
  const { sent, handler } = recorder(200)
  const { wrapper } = await mountPage({ 'PUT /api/plan': handler })
  await field(wrapper, 'Number of days').setValue('1')
  await field(wrapper, 'Number of days').setValue('3')
  expect(grid(wrapper)[1]).toEqual(['Tue 22', 'plan', 'plan', 'skip', 'all'])
  await field(wrapper, 'Number of days').setValue('1')
  await click(button(wrapper, 'Save'))
  expect(sent).toEqual([expect.objectContaining({ days: 1, skips: [], minimums: [{ day: 0, at_least: 2 }] })])
  wrapper.unmount()
})

test('the server refusing fields shows it on them', async () => {
  const { wrapper, router } = await mountPage({
    'PUT /api/plan': {
      status: 422,
      body: {
        detail: [
          { loc: ['body', 'start_date'], type: 'date_from_datetime_parsing', msg: 'bad' },
          { loc: ['body', 'days'], type: 'less_than_equal', msg: 'many' },
          { loc: ['body', 'meals', 2, 'name'], type: 'duplicate', msg: 'twice' },
          { loc: ['body', 'minimums', 0, 'at_least'], type: 'above_planned', msg: 'high' },
        ],
      },
    },
  })
  await click(button(wrapper, 'Save'))
  expect(router.currentRoute.value.fullPath).toBe('/plan/schedule')
  expect(wrapper.get('.start-field').text()).toContain('Enter a date, such as 2026-10-21.')
  expect(wrapper.get('.days-error').text()).toBe('A whole number from 1 to 31.')
  expect(wrapper.get('.meals-row').text()).toContain('Check the meal names.')
  expect(wrapper.findAll('.schedule-row-error').map((row) => row.text())).toEqual([
    'Mon 21: Must be at most the meals planned that day.',
  ])

  await click(wrapper.get('.meals-row'))
  const dinner = document.querySelector('.q-dialog input[aria-label="Name of meal 3"]')!.closest('.q-field')!
  expect(dinner.textContent).toContain('Another meal has this name.')
  wrapper.unmount()
})

test('any other failed save says so', async () => {
  const { wrapper } = await mountPage({ 'PUT /api/plan': 500 })
  await click(button(wrapper, 'Save'))
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  wrapper.unmount()
})

test('back leaves without saving', async () => {
  const { wrapper, router, calls } = await mountPage()
  await click(cell(wrapper, 'Breakfast on Mon 21'))
  await click(wrapper.get('[aria-label="Back"]'))
  expect(router.currentRoute.value.fullPath).toBe('/')
  expect(calls).not.toContain('PUT /api/plan')
  wrapper.unmount()
})

test('a plan that fails to load says so', async () => {
  const { wrapper } = await mountPage({ 'GET /api/plan': 500 })
  expect(wrapper.text()).toContain('Could not load the plan.')
  wrapper.unmount()
})

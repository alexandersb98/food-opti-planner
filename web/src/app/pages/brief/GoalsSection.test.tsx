import { act, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { Goal } from '../../../api/types'
import { attribute, goal, plan } from '../../../test-data'
import * as solve from '../../stores/solve'
import { fakeServer, mountApp, type FakeServer } from '../../test-app'

// Section 2 of the brief, the goals (ticket 17); the parity checklist is
// the Vue GoalsCard tests and the goal-sentence cases of the goals module.

const attributes = [
  attribute({ id: 1, name: 'Energy', unit: 'kcal' }),
  attribute({ id: 2, name: 'Protein', unit: 'g' }),
]

async function mountGoals(goals: Goal[], server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/plan': { body: plan({ goals }) },
    'GET /api/attributes': { body: attributes },
    'GET /api/tags': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': { body: { usable: 6, total: 8 } },
    ...server,
  })
  const app = await mountApp('/')
  const section = await screen.findByRole('region', { name: 'The goals' })
  return { ...app, calls, section }
}

/** The goals' buttons, in order. */
function goalButtons(section: HTMLElement) {
  const list = within(section).queryByRole('list')
  return list ? within(list).getAllByRole('button') : []
}

/** What a goal reads, in one line. */
function sentence(button: HTMLElement) {
  return button.querySelector('.goals-text')!.textContent
}

test('each goal reads as a sentence, for min only, max only, a range and exactly, in each scope', async () => {
  const { section } = await mountGoals([
    goal({
      id: 1,
      attribute_id: 1,
      min: '1500',
      max: '2000',
      applies_to: 'daily_average',
      must: true,
    }),
    goal({ id: 2, attribute_id: 2, min: '120', max: null, applies_to: 'day' }),
    goal({
      id: 3,
      attribute_id: 1,
      min: null,
      max: '14000',
      applies_to: 'plan_total',
    }),
    goal({
      id: 4,
      attribute_id: 2,
      min: '30',
      max: '30',
      applies_to: 'day',
      must: true,
    }),
  ])
  expect(goalButtons(section).map(sentence)).toEqual([
    'Between 1 500 and 2 000 kcal energy, as a daily average.',
    'At least 120 g protein, each day.',
    'At most 14 000 kcal energy, over the whole plan.',
    'Exactly 30 g protein, each day.',
  ])
  // the amount in bold, the attribute set apart
  const first = goalButtons(section)[0]!
  expect(first.querySelector('b')!.textContent).toBe('1 500 and 2 000 kcal')
  expect(first.querySelector('.goals-attr')!.textContent).toBe('energy')
})

test('Must goals say Must without dots; Prefer goals say Prefer with their importance as dots', async () => {
  const { section } = await mountGoals([
    goal({ id: 1, attribute_id: 1, min: '1800', max: '2200', must: true }),
    goal({ id: 2, attribute_id: 2, min: '120', importance: 4 }),
  ])
  const [must, prefer] = goalButtons(section)
  expect(must!.querySelector('.goals-strict')!.textContent).toBe('Must')
  expect(within(must!).queryByRole('img')).toBeNull()
  expect(must!.className).toContain('goals-must')
  expect(prefer!.querySelector('.goals-strict')!.textContent).toBe('Prefer')
  const dots = within(prefer!).getByRole('img', { name: 'Importance 4 of 5' })
  expect([...dots.querySelectorAll('.dots-dot')].map((dot) => dot.classList.contains('dots-on'))).toEqual([
    true,
    true,
    true,
    true,
    false,
  ])
  expect(prefer!.getAttribute('aria-label')).toBeNull()
  expect(prefer!.textContent).toContain('Prefer')
})

test('a Prefer goal with importance below and above shows both as dots, below / above', async () => {
  const { section } = await mountGoals([
    goal({
      id: 1,
      attribute_id: 1,
      min: '1800',
      max: '2200',
      importance: 3,
      importance_below: 2,
      importance_above: null,
    }),
  ])
  const [row] = goalButtons(section)
  const split = within(row!).getByRole('img', {
    name: 'Importance 2 of 5 below the range, 3 of 5 above',
  })
  const groups = [...split.querySelectorAll('.dots')].map((group) =>
    [...group.querySelectorAll('.dots-dot')].map((dot) => dot.classList.contains('dots-on')),
  )
  expect(groups).toEqual([
    [true, true, false, false, false],
    [true, true, true, false, false],
  ])
  expect(split.textContent).toBe('/')
})

test('a goal with a name shows it, with the sentence still saying what it tracks', async () => {
  const { section } = await mountGoals([
    goal({
      id: 1,
      attribute_id: 2,
      min: '120',
      custom_name: 'Protein floor',
      name: 'Protein floor',
    }),
    goal({ id: 2, attribute_id: 1, min: '1800' }),
  ])
  const [named, plain] = goalButtons(section)
  expect(named!.querySelector('.goals-name')!.textContent).toBe('Protein floor')
  expect(sentence(named!)).toBe('At least 120 g protein, each day.')
  expect(within(section).getByRole('button', { name: /Protein floor/ })).toBe(named)
  expect(plain!.querySelector('.goals-name')).toBeNull()
})

test('goals in the last clash are marked in red pencil and say "In the clash" to screen readers', async () => {
  const goals = [
    goal({ id: 1, attribute_id: 1, min: '1800', must: true }),
    goal({ id: 2, attribute_id: 2, min: '200', must: true }),
    goal({ id: 3, attribute_id: 2, min: '120' }),
  ]
  const { section } = await mountGoals(goals, {
    'POST /api/plan/solve': {
      body: {
        plan: null,
        failure: 'infeasible',
        clash: [
          {
            kind: 'goal',
            goal_id: 2,
            date: null,
            day: null,
            name: 'Protein per day',
          },
        ],
        clash_minimal: true,
      },
    },
  })
  expect(section.querySelector('.goals-clash')).toBeNull()
  await act(() => solve.start(10))
  const rows = goalButtons(section)
  expect(rows.map((row) => row.classList.contains('goals-clash'))).toEqual([false, true, false])
  expect(rows[1]!.querySelector('.visually-hidden')!.textContent).toBe('In the clash:')
  expect(within(section).getByRole('button', { name: /^In the clash: Must/ })).toBe(rows[1])
  expect(rows[0]!.textContent).not.toContain('In the clash')
  // closing the note clears the marks
  act(() => solve.dismiss())
  expect(section.querySelector('.goals-clash')).toBeNull()
})

test('without goals, the section says what happens and explains Must and Prefer', async () => {
  const { section } = await mountGoals([])
  expect(within(section).queryByRole('list')).toBeNull()
  expect(within(section).getByText('No goals yet. Add one, or the planner only fills the schedule.')).toBeDefined()
  expect(section.querySelector('.brief-section-intro')!.textContent).toBe(
    'Must goals are kept or there is no plan. Prefer goals are weighed against each other by importance.',
  )
})

test('Add goal and each goal are buttons, which open nothing visible until the goal sheet', async () => {
  const { section } = await mountGoals([goal({ id: 1, attribute_id: 1 })])
  const add = within(section).getByRole('button', { name: 'Add goal' })
  expect(add.hasAttribute('disabled')).toBe(false)
  expect(add.hasAttribute('aria-describedby')).toBe(false)
  expect(within(section).queryByText('Add an attribute first')).toBeNull()
  await act(async () => add.click())
  await act(async () => goalButtons(section)[0]!.click())
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('without attributes, Add goal is disabled and says to add an attribute first', async () => {
  const { section } = await mountGoals([], {
    'GET /api/attributes': { body: [] },
  })
  const add = within(section).getByRole('button', { name: 'Add goal' })
  expect(add.hasAttribute('disabled')).toBe(true)
  const hint = within(section).getByText('Add an attribute first')
  expect(add.getAttribute('aria-describedby')).toBe(hint.id)
})

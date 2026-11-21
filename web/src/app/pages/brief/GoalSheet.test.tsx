import { screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { Goal, Plan } from '../../../api/types'
import { planFields } from '../../../planFields'
import { attribute, goal, plan } from '../../../test-data'
import { fakeServer, mountApp, type FakeReply, type FakeServer } from '../../test-app'

// The goal sheet (ticket 18); the parity checklist is the Vue GoalDialog
// tests (src/components/GoalDialog.test.ts) and the goal draft rules.

const attributes = [
  attribute({ id: 1, name: 'Energy', unit: 'kcal' }),
  attribute({ id: 2, name: 'Protein', unit: 'g', decimals: 1 }),
]
const protein = goal({ id: 7, attribute_id: 2, min: '120', max: null, importance: 4 })
const energy = goal({ id: 8, attribute_id: 1, min: '1800', max: '2200', must: true, applies_to: 'daily_average' })
// A goal's advanced settings when it has none, as sent.
const noAdvanced = {
  custom_name: null,
  importance_below: null,
  importance_above: null,
  day_guard_rail: true,
  guard_rail_importance: null,
}

type Sent = { goals: Record<string, unknown>[] }

/** The sent setup is answered back as the server's, new goals given ids. */
function answer(body: unknown): FakeReply {
  const sent = body as Plan
  return {
    body: {
      ...plan(),
      ...sent,
      goals: sent.goals.map((g, i) => ({ ...g, id: g.id ?? 100 + i, name: '' })),
    },
  }
}

/**
 * The brief with `goals`, and the goal sheet opened for `toEdit` (by its
 * place among `goals`) or for a new goal. `put` answers the saves (by
 * default as the server does); `sent` collects what was sent.
 */
async function openSheet(toEdit: Goal | null, goals: Goal[] = [protein, energy], put?: FakeServer[string]) {
  const sent: Sent[] = []
  const server: FakeServer = {
    'GET /api/session': 204,
    'GET /api/plan': { body: plan({ goals }) },
    'GET /api/attributes': { body: attributes },
    'GET /api/tags': { body: [] },
    'GET /api/plan-results': { body: { unsaved: null, saved: [] } },
    'GET /api/plan-results/today': { body: null },
    'POST /api/plan/recipe-count': { body: { usable: 6, total: 8 } },
  }
  const reply = (body: unknown) => {
    sent.push(body as Sent)
    const given = putReply.current
    if (given === undefined) return answer(body)
    return typeof given === 'function' ? given(body) : given
  }
  const putReply: { current: FakeServer[string] | undefined } = { current: put }
  fakeServer({ ...server, 'PUT /api/plan': reply })
  const app = await mountApp('/')
  const section = await screen.findByRole('region', { name: 'The goals' }, { timeout: 5000 })
  const list = within(section).queryByRole('list')
  const opener = toEdit
    ? within(list!).getAllByRole('button')[goals.indexOf(toEdit)]!
    : within(section).getByRole('button', { name: 'Add goal' })
  await app.user.click(opener)
  const sheet = await screen.findByRole('dialog')
  /** Answer the next saves with `reply` instead. */
  const refuse = (next: FakeServer[string]) => {
    putReply.current = next
  }
  return { ...app, sent, section, sheet, opener, refuse }
}

type Opened = Awaited<ReturnType<typeof openSheet>>

/** A text field of the sheet by the start of its label ("Min" is "Min (kcal)"). */
function field(sheet: HTMLElement, label: string) {
  return within(sheet).queryByRole('textbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement | null
}

async function type({ user, sheet }: Opened, label: string, text: string) {
  const input = field(sheet, label)!
  await user.clear(input)
  if (text) await user.type(input, text)
}

async function click({ user, sheet }: Opened, name: string) {
  await user.click(within(sheet).getByRole('button', { name }))
}

/** The pressed choice in the group named `legend`, or null. */
function chosen(sheet: HTMLElement, legend: string) {
  const group = within(sheet).queryByRole('group', { name: legend })
  if (!group) return null
  const pressed = within(group)
    .queryAllByRole('button')
    .find((button) => button.getAttribute('aria-pressed') === 'true')
  return pressed?.textContent ?? null
}

/** The importance chosen in the group named `legend`, as a number, or null
 * when the group is not shown. */
function importance(sheet: HTMLElement, legend: string) {
  const value = chosen(sheet, legend)
  return value === null ? null : Number(value)
}

async function pick({ user, sheet }: Opened, legend: string, n: number) {
  const group = within(sheet).getByRole('group', { name: legend })
  await user.click(within(group).getByRole('button', { name: `Importance ${n} of 5` }))
}

const toggle = (sheet: HTMLElement, label: string) => within(sheet).queryByRole('switch', { name: label })

async function flip(opened: Opened, label: string) {
  await opened.user.click(toggle(opened.sheet, label)!)
}

const advanced = (sheet: HTMLElement) => sheet.querySelector('details')!

async function openAdvanced({ user, sheet }: Opened) {
  await user.click(within(sheet).getByText('Advanced'))
}

const preview = (sheet: HTMLElement) => sheet.querySelector('.sheet-preview')!

const text = (sheet: HTMLElement) => sheet.textContent ?? ''

test('it opens with the goal’s fields, Done and Remove goal', async () => {
  const { sheet } = await openSheet(protein)
  expect(within(sheet).getByRole('heading', { name: 'Edit goal' })).toBeTruthy()
  expect(field(sheet, 'Min')!.value).toBe('120')
  expect(field(sheet, 'Max')!.value).toBe('')
  expect(within(sheet).getByRole('textbox', { name: 'Min (g)' })).toBeTruthy() // the unit in the label
  expect(chosen(sheet, 'What to track')).toBe('Protein')
  expect(chosen(sheet, 'Applies to')).toBe('Each day')
  expect(chosen(sheet, 'How strict')).toBe('Prefer')
  expect(importance(sheet, 'Importance')).toBe(4)
  expect(within(sheet).getByRole('button', { name: 'Remove goal' })).toBeTruthy()
  expect(within(sheet).getByRole('button', { name: 'Done' })).toBeTruthy()
})

test('a new goal starts on the first attribute, Each day, Prefer, importance 3, without Remove', async () => {
  const { sheet } = await openSheet(null)
  expect(within(sheet).getByRole('heading', { name: 'Add goal' })).toBeTruthy()
  expect(chosen(sheet, 'What to track')).toBe('Energy')
  expect(chosen(sheet, 'Applies to')).toBe('Each day')
  expect(chosen(sheet, 'How strict')).toBe('Prefer')
  expect(importance(sheet, 'Importance')).toBe(3)
  expect(within(sheet).queryByRole('button', { name: 'Remove goal' })).toBeNull()
  expect(within(sheet).getByRole('button', { name: 'Add goal' }).getAttribute('type')).toBe('submit')
})

test('Applies to reads Each day, Daily average, Plan total', async () => {
  const { sheet } = await openSheet(null)
  const group = within(sheet).getByRole('group', { name: 'Applies to' })
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Each day', 'Daily average', 'Plan total'])
})

test('the live preview reads the goal as edited, in a polite live region', async () => {
  const opened = await openSheet(null)
  const { sheet } = opened
  expect(preview(sheet).getAttribute('aria-live')).toBe('polite')
  expect(preview(sheet).textContent).toBe('No limit yet on energy, each day: preferred, importance 3.')
  await type(opened, 'Min', '1500')
  await type(opened, 'Max', '2000')
  await click(opened, 'Daily average')
  expect(preview(sheet).textContent).toBe('Between 1\u202f500 and 2\u202f000 kcal energy, as a daily average: preferred, importance 3.')
  expect(preview(sheet).querySelector('b')!.textContent).toBe('1\u202f500 and 2\u202f000 kcal')
  await pick(opened, 'Importance', 5)
  expect(preview(sheet).textContent).toContain('preferred, importance 5.')
  await click(opened, 'Must')
  expect(preview(sheet).textContent).toBe('Between 1\u202f500 and 2\u202f000 kcal energy, as a daily average: must.')
  await click(opened, 'Protein')
  expect(preview(sheet).textContent).toBe('Between 1\u202f500 and 2\u202f000 g protein, as a daily average: must.')
  expect(within(sheet).getByRole('textbox', { name: 'Max (g)' })).toBeTruthy()
})

test('importance shows for Prefer only', async () => {
  const opened = await openSheet(protein)
  expect(importance(opened.sheet, 'Importance')).toBe(4)
  await click(opened, 'Must')
  expect(importance(opened.sheet, 'Importance')).toBeNull()
  await click(opened, 'Prefer')
  expect(importance(opened.sheet, 'Importance')).toBe(4)
})

test('the zero-bound field shows when a bound is 0 and a soft penalty is made, with its example', async () => {
  const opened = await openSheet(null)
  const label = 'Count a miss as a percentage of'
  expect(field(opened.sheet, label)).toBeNull()
  await type(opened, 'Min', '0')
  expect(field(opened.sheet, label)).not.toBeNull() // Prefer
  await type(opened, label, '25')
  expect(text(opened.sheet)).toContain('With 25 kcal, missing by 5 kcal counts as 20%.')
  await click(opened, 'Must')
  expect(field(opened.sheet, label)).toBeNull() // a Must goal each day needs none
  await click(opened, 'Daily average')
  expect(field(opened.sheet, label)).not.toBeNull() // its day guard-rail is soft
  await flip(opened, 'Also keep each day in range')
  expect(field(opened.sheet, label)).toBeNull() // without it, nothing soft is left
  await flip(opened, 'Also keep each day in range')
  await type(opened, 'Min', '1')
  expect(field(opened.sheet, label)).toBeNull()
  await type(opened, 'Min', '-5') // a negative bound would reward a miss, so it counts as 0 too
  expect(field(opened.sheet, label)).not.toBeNull()
})

test('a goal needs a bound, each a number, and a zero bound a reference above 0, each error on its field', async () => {
  const opened = await openSheet(null)
  const { sheet, sent } = opened
  await click(opened, 'Add goal')
  expect(field(sheet, 'Min')!.getAttribute('aria-invalid')).toBe('true')
  expect(within(sheet).getByText('Give a minimum, a maximum or both.').id).toBe(
    field(sheet, 'Min')!.getAttribute('aria-describedby'),
  )
  expect(document.activeElement).toBe(field(sheet, 'Min')) // focus on the first error
  await type(opened, 'Min', 'lots')
  await type(opened, 'Max', '5,5x')
  await click(opened, 'Add goal')
  expect(field(sheet, 'Min')!.getAttribute('aria-invalid')).toBe('true')
  expect(field(sheet, 'Max')!.getAttribute('aria-invalid')).toBe('true')
  expect(text(sheet).match(/A number, such as 120 or 1.5./g)).toHaveLength(2)
  await type(opened, 'Min', '0')
  await type(opened, 'Max', '')
  await click(opened, 'Add goal')
  const reference = field(sheet, 'Count a miss as a percentage of')!
  expect(reference.getAttribute('aria-invalid')).toBe('true')
  expect(text(sheet)).toContain('A number above 0.')
  expect(sent).toEqual([])
  expect(screen.getByRole('dialog')).toBe(sheet) // still open
})

test('Add goal sends the whole setup with the goal added, closes, shows it on the brief and toasts', async () => {
  const opened = await openSheet(null)
  await type(opened, 'Min', '1,5') // a comma taken as the decimal point
  await click(opened, 'Add goal')
  expect(opened.sent).toEqual([
    {
      ...planFields(plan({ goals: [] })),
      goals: [
        { id: 7, attribute_id: 2, min: '120', max: null, applies_to: 'day', must: false, importance: 4, zero_reference: null, ...noAdvanced },
        { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null, ...noAdvanced },
        { id: null, attribute_id: 1, min: '1.5', max: null, applies_to: 'day', must: false, importance: 3, zero_reference: null, ...noAdvanced },
      ],
    },
  ])
  expect(await screen.findByText('Goal added.')).toBeTruthy()
  const sentences = [...opened.section.querySelectorAll('.goals-text')].map((s) => s.textContent)
  expect(sentences).toContain('At least 1.5 kcal energy, each day.')
})

test('Done sends a changed goal in its place, with the reference only while needed, and the brief updates at once', async () => {
  const opened = await openSheet(protein)
  await type(opened, 'Min', '0')
  await type(opened, 'Count a miss as a percentage of', '25')
  await click(opened, 'Must') // a Must goal each day: the reference is dropped
  await click(opened, 'Done')
  expect(opened.sent[0]!.goals).toEqual([
    { id: 7, attribute_id: 2, min: '0', max: null, applies_to: 'day', must: true, importance: 4, zero_reference: null, ...noAdvanced },
    { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null, ...noAdvanced },
  ])
  expect(await screen.findByText('Goal changed.')).toBeTruthy()
  const first = opened.section.querySelector('.goals-goal')!
  expect(first.querySelector('.goals-text')!.textContent).toBe('At least 0 g protein, each day.')
  expect(first.querySelector('.goals-strict')!.textContent).toBe('Must')
})

test('Remove goal removes it with one request, closes and toasts', async () => {
  const opened = await openSheet(protein)
  await click(opened, 'Remove goal')
  expect(opened.sent).toHaveLength(1)
  expect(opened.sent[0]!.goals).toEqual([
    { id: 8, attribute_id: 1, min: '1800', max: '2200', applies_to: 'daily_average', must: true, importance: 3, zero_reference: null, ...noAdvanced },
  ])
  expect(await screen.findByText('Goal removed.')).toBeTruthy()
  expect(opened.section.querySelectorAll('.goals-goal')).toHaveLength(1)
  // the goal's own button is gone: focus goes to Add goal
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(within(opened.section).getByRole('button', { name: 'Add goal' }))
})

test('a refused removal shows the general error only, not field errors at the next goal’s place', async () => {
  // Without protein, energy is the goal at index 0 of the goals sent.
  const opened = await openSheet(protein, [protein, energy], {
    status: 422,
    body: { detail: [{ loc: ['body', 'goals', 0, 'min'], type: 'min_above_max', msg: 'no' }] },
  })
  await click(opened, 'Remove goal')
  expect(within(opened.sheet).getByRole('alert').textContent).toBe('Could not save. Try again.')
  expect(text(opened.sheet)).not.toContain('Must be at most the maximum.')
  expect(screen.getByRole('dialog')).toBe(opened.sheet)
  expect(opened.section.querySelectorAll('.goals-goal')).toHaveLength(2)
})

test('the server’s field errors show on their fields', async () => {
  const refusal = (loc: string, type: string): FakeReply => ({
    status: 422,
    body: { detail: [{ loc: ['body', 'goals', 2, loc], type, msg: 'no' }] },
  })
  const opened = await openSheet(null, [protein, energy], refusal('min', 'min_above_max'))
  const { sheet } = opened
  await type(opened, 'Min', '9')
  await click(opened, 'Add goal')
  expect(text(sheet)).toContain('Must be at most the maximum.')
  expect(field(sheet, 'Min')!.getAttribute('aria-invalid')).toBe('true')

  opened.refuse(refusal('max', 'too_many_decimals'))
  await click(opened, 'Add goal')
  expect(text(sheet)).not.toContain('Must be at most the maximum.')
  expect(text(sheet)).toContain('At most 0 decimals for Energy.')
  expect(field(sheet, 'Max')!.getAttribute('aria-invalid')).toBe('true')

  await type(opened, 'Min', '0') // the reference field shows
  await type(opened, 'Count a miss as a percentage of', '25')
  opened.refuse(refusal('zero_reference', 'needs_reference'))
  await click(opened, 'Add goal')
  expect(field(sheet, 'Count a miss as a percentage of')!.getAttribute('aria-invalid')).toBe('true')

  opened.refuse(refusal('attribute_id', 'unknown_attribute'))
  await click(opened, 'Add goal')
  expect(within(sheet).getByRole('group', { name: 'What to track' }).textContent).toContain('Pick an attribute.')

  opened.refuse(500)
  await click(opened, 'Add goal')
  expect(text(sheet)).toContain('Could not save. Try again.')
  expect(screen.getByRole('dialog')).toBe(sheet)
})

test('the name follows the attribute and Applies to, numbered among the goals, until typed in', async () => {
  const opened = await openSheet(null)
  await type(opened, 'Min', '100')
  await openAdvanced(opened)
  expect(field(opened.sheet, 'Goal name')!.value).toBe('Energy per day')
  await click(opened, 'Protein')
  expect(field(opened.sheet, 'Goal name')!.value).toBe('Protein per day (2)') // the first protein goal has it
  await click(opened, 'Plan total')
  expect(field(opened.sheet, 'Goal name')!.value).toBe('Protein, plan total')
  await type(opened, 'Goal name', '  Protein floor ')
  await click(opened, 'Each day') // the name stops following once edited
  await click(opened, 'Energy')
  expect(field(opened.sheet, 'Goal name')!.value).toBe('  Protein floor ')
  await click(opened, 'Add goal')
  expect(opened.sent[0]!.goals[2]).toMatchObject({ custom_name: 'Protein floor' })
})

test('clearing the name follows again', async () => {
  const named = goal({ ...protein, custom_name: 'Protein floor' })
  const opened = await openSheet(named, [named, energy])
  const name = () => field(opened.sheet, 'Goal name')!
  expect(name().value).toBe('Protein floor')
  await opened.user.clear(name())
  expect(name().getAttribute('placeholder')).toBe('Protein per day')
  await opened.user.click(field(opened.sheet, 'Min')!) // leaves the name
  expect(name().value).toBe('Protein per day')
  await click(opened, 'Plan total')
  expect(name().value).toBe('Protein, plan total')
  await click(opened, 'Done')
  expect(opened.sent[0]!.goals[0]).toMatchObject({ custom_name: null })
})

test('Advanced is closed for a new goal and a goal without advanced settings', async () => {
  const opened = await openSheet(null)
  expect(advanced(opened.sheet).open).toBe(false)
  expect(within(opened.sheet).getByText('Advanced')).toBeTruthy()
})

test('Advanced is closed for a goal without advanced settings', async () => {
  const opened = await openSheet(energy)
  expect(advanced(opened.sheet).open).toBe(false)
})

test.each([
  ['a typed name', { custom_name: 'Fuel' }],
  ['importance below and above', { applies_to: 'day', must: false, importance_below: 2, importance_above: 4 }],
  ['the guard-rail off', { day_guard_rail: false }],
  ['the guard-rail’s own importance', { guard_rail_importance: 5 }],
] as const)('Advanced is open by itself for a goal with %s', async (_, fields) => {
  const special = goal({ ...energy, ...fields })
  const opened = await openSheet(special, [protein, special])
  expect(advanced(opened.sheet).open).toBe(true)
})

test('importance below and above shows for Prefer with both bounds only, replacing the main choice', async () => {
  const opened = await openSheet(protein)
  const { sheet } = opened
  await openAdvanced(opened)
  const split = 'Different importance below and above'
  expect(toggle(sheet, split)).toBeNull() // no maximum
  await type(opened, 'Max', '150')
  expect(toggle(sheet, split)).not.toBeNull()
  await flip(opened, split)
  expect(importance(sheet, 'Importance')).toBeNull()
  expect(text(sheet)).toContain('Set below and above, under Advanced')
  expect(importance(sheet, 'Below the range')).toBe(4) // starting at the goal's importance
  expect(importance(sheet, 'Above the range')).toBe(4)
  expect(preview(sheet).textContent).toContain('preferred, importance 4 below and 4 above.')
  await click(opened, 'Must')
  expect(toggle(sheet, split)).toBeNull()
  expect(importance(sheet, 'Below the range')).toBeNull()
  expect(text(sheet)).not.toContain('Set below and above')
  await click(opened, 'Prefer')
  await flip(opened, split)
  expect(importance(sheet, 'Importance')).toBe(4)
  expect(importance(sheet, 'Below the range')).toBeNull()
})

test('the day guard-rail shows for a daily average only, its importance following the goal until picked', async () => {
  const opened = await openSheet(protein)
  const { sheet } = opened
  await openAdvanced(opened)
  const guardRail = 'Also keep each day in range'
  const each = 'Importance of each day'
  expect(toggle(sheet, guardRail)).toBeNull()
  await click(opened, 'Plan total')
  expect(toggle(sheet, guardRail)).toBeNull()
  await click(opened, 'Daily average')
  expect((toggle(sheet, guardRail) as HTMLInputElement).checked).toBe(true) // on by default
  expect(importance(sheet, each)).toBe(3) // one step below Prefer's 4
  await pick(opened, 'Importance', 2)
  expect(importance(sheet, each)).toBe(1)
  await click(opened, 'Must')
  expect(importance(sheet, each)).toBe(2) // shown for Must too
  await pick(opened, each, 5)
  await click(opened, 'Prefer')
  expect(importance(sheet, each)).toBe(5) // once picked, its own
  await flip(opened, guardRail)
  expect(importance(sheet, each)).toBeNull()
})

test('Add goal sends the advanced settings shown', async () => {
  const opened = await openSheet(null)
  await type(opened, 'Min', '1800')
  await type(opened, 'Max', '2200')
  await openAdvanced(opened)
  await type(opened, 'Goal name', 'Fuel')
  await flip(opened, 'Different importance below and above')
  await pick(opened, 'Below the range', 5)
  await pick(opened, 'Above the range', 1)
  await click(opened, 'Daily average')
  await pick(opened, 'Importance of each day', 4)
  await click(opened, 'Add goal')
  expect(opened.sent[0]!.goals[2]).toEqual({
    id: null,
    attribute_id: 1,
    min: '1800',
    max: '2200',
    applies_to: 'daily_average',
    must: false,
    importance: 3,
    zero_reference: null,
    custom_name: 'Fuel',
    importance_below: 5,
    importance_above: 1,
    day_guard_rail: true,
    guard_rail_importance: 4,
  })
})

test('Done sends the defaults for advanced settings turned off', async () => {
  const special = goal({ ...energy, must: false, importance_below: 5, importance_above: 1, guard_rail_importance: 4 })
  const opened = await openSheet(special, [protein, special])
  await flip(opened, 'Also keep each day in range')
  await click(opened, 'Done')
  expect(opened.sent[0]!.goals[1]).toMatchObject({ day_guard_rail: false, guard_rail_importance: null })
})

test('Done sends the defaults for advanced settings hidden', async () => {
  const special = goal({ ...energy, must: false, importance_below: 5, importance_above: 1, guard_rail_importance: 4 })
  const opened = await openSheet(special, [protein, special])
  await click(opened, 'Each day') // the guard-rail is hidden
  await click(opened, 'Must') // the split is hidden
  await click(opened, 'Done')
  expect(opened.sent[0]!.goals[1]).toMatchObject({
    importance_below: null,
    importance_above: null,
    day_guard_rail: true,
    guard_rail_importance: null,
  })
})

test('the guard-rail’s importance is sent as null while it follows the goal', async () => {
  const opened = await openSheet(energy)
  await click(opened, 'Done')
  expect(opened.sent[0]!.goals[1]).toMatchObject({ day_guard_rail: true, guard_rail_importance: null })
})

test('the server’s errors on the advanced settings show on their fields, opening Advanced by itself', async () => {
  const refusal = (loc: string, type: string): FakeReply => ({
    status: 422,
    body: { detail: [{ loc: ['body', 'goals', 2, loc], type, msg: 'no' }] },
  })
  const opened = await openSheet(null, [protein, energy], refusal('custom_name', 'duplicate'))
  const { sheet } = opened
  await type(opened, 'Min', '1800')
  await type(opened, 'Max', '2200')
  await click(opened, 'Daily average')
  expect(advanced(sheet).open).toBe(false)
  await click(opened, 'Add goal')
  expect(advanced(sheet).open).toBe(true)
  expect(text(sheet)).toContain('Another goal has this name.')
  expect(field(sheet, 'Goal name')!.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(field(sheet, 'Goal name'))
  expect(text(sheet)).not.toContain('Could not save. Try again.')

  // closed by the reader, it opens again on the next error inside it
  await opened.user.click(within(sheet).getByText('Advanced'))
  expect(advanced(sheet).open).toBe(false)
  opened.refuse(refusal('custom_name', 'string_too_long'))
  await click(opened, 'Add goal')
  expect(advanced(sheet).open).toBe(true)
  expect(text(sheet)).toContain('At most 100 characters.')

  await flip(opened, 'Different importance below and above')
  for (const [loc, legend] of [
    ['importance_below', 'Below the range'],
    ['importance_above', 'Above the range'],
  ] as const) {
    opened.refuse(refusal(loc, 'less_than_equal'))
    await click(opened, 'Add goal')
    expect(text(sheet).match(/An importance from 1 to 5./g)).toHaveLength(1)
    expect(within(sheet).getByRole('group', { name: legend }).textContent).toContain('An importance from 1 to 5.')
    expect(text(sheet)).not.toContain('Could not save. Try again.')
  }
  opened.refuse(refusal('guard_rail_importance', 'less_than_equal'))
  await click(opened, 'Add goal')
  expect(text(sheet).match(/An importance from 1 to 5./g)).toHaveLength(1)
  opened.refuse(refusal('day_guard_rail', 'bool_parsing'))
  await click(opened, 'Add goal')
  expect(text(sheet)).toContain('Could not save this setting.')
})

test('closing without saving sends nothing; opening again starts from the goal as stored', async () => {
  const opened = await openSheet(protein)
  await type(opened, 'Min', '50')
  await opened.user.keyboard('{Escape}')
  expect(opened.sent).toEqual([])
  await opened.user.click(opened.section.querySelector<HTMLElement>('.goals-goal')!)
  const sheet = await screen.findByRole('dialog')
  expect(field(sheet, 'Min')!.value).toBe('120')
})

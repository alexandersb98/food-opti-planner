import { expect, test } from 'vitest'
import type { ClashMember } from './api/types'
import { changed, clashDrafts, clashErrors, clashFields, clashingGoalIds, clashRows, clashServerErrors } from './clash'
import { makeI18n } from './i18n'
import { goalFields, planFields } from './plan'
import { attribute, goal, plan } from './test-data'

const { t } = makeI18n().global
const attributes = [attribute({ id: 1, name: 'Energy' }), attribute({ id: 2, name: 'Protein', decimals: 1 })]

function member(fields: Partial<ClashMember>): ClashMember {
  return { kind: 'goal', goal_id: null, name: null, day: null, date: null, ...fields }
}

const energy = goal({ id: 7, attribute_id: 1, max: '50', min: null, must: true })
const total = goal({ id: 8, attribute_id: 1, max: '350', min: null, must: true, applies_to: 'plan_total' })
const prefer = goal({ id: 9, attribute_id: 2, min: '100' })

test('the rows are one per goal, with its dates, and one per day of meals, in the clash order', () => {
  const clash = [
    member({ goal_id: 8, name: 'Energy, plan total' }),
    member({ goal_id: 7, day: 0, date: '2026-09-21' }),
    member({ goal_id: 7, day: 2, date: '2026-09-23' }),
    member({ kind: 'day_minimum', day: 0, date: '2026-09-21' }),
    member({ kind: 'day_minimum', day: 2, date: '2026-09-23' }),
  ]
  const setup = plan({ goals: [energy, total], minimums: [{ day: 2, at_least: 1 }] })
  expect(clashRows(clash, setup)).toEqual([
    { kind: 'goal', goal: total, dates: [] },
    { kind: 'goal', goal: energy, dates: ['2026-09-21', '2026-09-23'] },
    { kind: 'day_minimum', day: 0, date: '2026-09-21', atLeast: null },
    { kind: 'day_minimum', day: 2, date: '2026-09-23', atLeast: 1 },
  ])
})

test('a goal deleted or made Prefer since, and a day the schedule no longer has, drop out', () => {
  const clash = [
    member({ goal_id: 7, day: 0, date: '2026-09-21' }),
    member({ goal_id: 9, day: 0, date: '2026-09-21' }),
    member({ goal_id: 4, day: 0, date: '2026-09-21' }),
    member({ kind: 'day_minimum', day: 3, date: '2026-09-24' }),
  ]
  expect(clashRows(clash, plan({ days: 3, goals: [energy, prefer] }))).toEqual([
    { kind: 'goal', goal: energy, dates: ['2026-09-21'] },
  ])
})

test('the clashing goal ids leave the days of meals out', () => {
  expect(clashingGoalIds([member({ goal_id: 7 }), member({ kind: 'day_minimum', day: 0 })])).toEqual([7])
  expect(clashingGoalIds(null)).toEqual([])
})

test('a draft starts as the goal is stored, and is changed by its bounds, Must or reference', () => {
  const drafts = clashDrafts([{ kind: 'goal', goal: energy, dates: [] }])
  expect(changed(energy, drafts[7]!)).toBe(false)
  expect(changed(energy, { ...drafts[7]!, max: '80' })).toBe(true)
  expect(changed(energy, { ...drafts[7]!, must: false })).toBe(true)
  expect(changed(energy, { ...drafts[7]!, zero_reference: '10' })).toBe(true)
})

test('nothing changed sends nothing; a change sends that goal, the rest as loaded', () => {
  const setup = plan({ goals: [prefer, energy, total] })
  const drafts = clashDrafts(clashRows([member({ goal_id: 7 }), member({ goal_id: 8 })], setup))
  expect(clashFields(setup, drafts)).toBeNull()

  drafts[7]!.max = '120'
  drafts[8]!.must = false
  const fields = clashFields(setup, drafts)!
  expect(fields).toEqual({
    ...planFields(setup),
    goals: [
      goalFields(prefer),
      { ...goalFields(energy), max: '120' },
      { ...goalFields(total), must: false },
    ],
  })
})

test('a changed goal is checked as the goal editor checks it; an unchanged one is not', () => {
  const zero = goal({ id: 5, attribute_id: 1, min: null, max: '0', must: true })
  const drafts = clashDrafts([
    { kind: 'goal', goal: energy, dates: [] },
    { kind: 'goal', goal: total, dates: [] },
    { kind: 'goal', goal: zero, dates: [] },
  ])
  drafts[7]!.max = 'lots'
  drafts[8]!.max = ''
  drafts[5]!.must = false
  expect(clashErrors([energy, total, zero], drafts, t)).toEqual({
    7: { min: '', max: t('goals.editor.notNumber'), reference: '' },
    8: { min: t('goals.editor.needBound'), max: '', reference: '' },
    // Made Prefer at 0, it needs the zero-bound field.
    5: { min: '', max: '', reference: t('goals.editor.referenceNeeded') },
  })
  drafts[5]!.zero_reference = '100'
  expect(clashErrors([zero], drafts, t)).toEqual({})
  expect(clashFields(plan({ goals: [zero] }), drafts)!.goals[0]).toMatchObject({ must: false, zero_reference: '100' })
})

test("the server's refusals are marked on the card's goals; one elsewhere marks none", () => {
  const setup = plan({ goals: [prefer, energy] })
  expect(clashServerErrors({ 'goals.1.max': 'too_many_decimals' }, setup, attributes, [7], t)).toEqual({
    7: expect.objectContaining({ max: 'At most 0 decimals for Energy.' }),
  })
  expect(clashServerErrors({ 'goals.0.min': 'no_bound' }, setup, attributes, [7], t)).toEqual({})
})

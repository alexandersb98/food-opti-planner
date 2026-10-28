import { expect, test } from 'vitest'
import { makeI18n } from '../i18n'
import { attribute, goal } from '../test-data'
import {
  draftErrors,
  draftFields,
  draftFromGoal,
  opensAdvanced,
  serverErrors,
  showsReference,
  showsSplit,
  type GoalDraft,
} from './useGoalDraft'

const { t } = makeI18n().global
const attributes = [attribute({ id: 1, name: 'Energy' }), attribute({ id: 2, name: 'Protein', decimals: 1 })]

/** A new goal's draft with `fields` typed. */
function draft(fields: Partial<GoalDraft> = {}): GoalDraft {
  return { ...draftFromGoal(null, attributes), ...fields }
}

test('a new goal starts on the first attribute, each day, Prefer, importance 3', () => {
  expect(draft()).toMatchObject({ attribute_id: 1, min: '', max: '', applies_to: 'day', must: false, importance: 3 })
})

test("a goal's draft has its bounds as text and, without a split, both sides at its importance", () => {
  const protein = goal({ id: 7, attribute_id: 2, min: '120', max: null, importance: 4 })
  expect(draftFromGoal(protein, attributes)).toMatchObject({
    min: '120',
    max: '',
    zero_reference: '',
    name: '',
    split: false,
    importance_below: 4,
    importance_above: 4,
  })
})

test('the Advanced section opens for a goal with advanced settings, never for a new one', () => {
  const named = goal({ id: 7, attribute_id: 2, custom_name: 'Mine' })
  expect(opensAdvanced(named, draftFromGoal(named, attributes))).toBe(true)
  const plain = goal({ id: 7, attribute_id: 2 })
  expect(opensAdvanced(plain, draftFromGoal(plain, attributes))).toBe(false)
  expect(opensAdvanced(null, draft({ name: 'Mine' }))).toBe(false)
})

test('the reference shows for a zero bound typed; the split for a Prefer goal with both bounds', () => {
  expect(showsReference(draft({ min: '0' }))).toBe(true)
  expect(showsReference(draft({ min: ' ', max: '10' }))).toBe(false)
  expect(showsSplit(draft({ min: '1', max: '2' }))).toBe(true)
  expect(showsSplit(draft({ min: '1', max: '2', must: true }))).toBe(false)
  expect(showsSplit(draft({ min: '1', max: ' ' }))).toBe(false)
})

test.each([
  ['', '', { min: 'Give a minimum, a maximum or both.', max: '', reference: '' }],
  ['x', '', { min: 'A number, such as 120 or 1.5.', max: '', reference: '' }],
  ['0', '', { min: '', max: '', reference: 'A number above 0.' }],
  ['1,5', '', { min: '', max: '', reference: '' }],
])('bounds "%s" and "%s" are marked %j', (min, max, errors) => {
  expect(draftErrors(draft({ min, max }), t)).toEqual(errors)
})

test('the fields send the bounds as numbers, and hidden settings as their defaults', () => {
  const typed = draft({ min: '1,5', must: true, split: true, importance_below: 5, day_guard_rail: false, guard_rail_importance: 4 })
  expect(draftFields(typed, 7, 'Mine')).toMatchObject({
    id: 7,
    min: '1.5',
    max: null,
    zero_reference: null,
    custom_name: 'Mine',
    importance_below: null,
    importance_above: null,
    day_guard_rail: true,
    guard_rail_importance: null,
  })
})

test("the server's errors are marked on the goal sent at its index only", () => {
  const found = { 'goals.1.min': 'too_many_decimals', 'goals.1.custom_name': 'duplicate', 'goals.0.max': 'not_a_number' }
  expect(serverErrors(found, 1, attributes[1], t)).toMatchObject({
    min: 'At most 1 decimals for Protein.',
    max: '',
    name: 'Another goal has this name.',
    save: '',
  })
})

test('a refusal on no field of the goal says the save failed', () => {
  expect(serverErrors({ 'goals.0.min': 'no_bound' }, 1, attributes[1], t).save).toBe(t('common.saveFailed'))
})

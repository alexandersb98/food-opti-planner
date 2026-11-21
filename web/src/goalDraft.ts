import type { Attribute, Goal, GoalFields } from './api/types'
import { boundError, IMPORTANCE, NAME_LENGTH, needsZeroReference, type Translate } from './goals'
import { typedNumber } from './numbers'

// The goal editor's draft rules (A3, A3b): the fields as typed, which of them
// show, what is wrong with them, and the goal they make. Framework-neutral:
// the Vue hook (`composables/useGoalDraft`) and the React app both use them.

/** The fields as typed: the bounds, the reference and the name stay text.
 * Settings the form hides keep their value here and are sent as defaults. */
export type GoalDraft = {
  attribute_id: number
  min: string
  max: string
  applies_to: Goal['applies_to']
  must: boolean
  importance: number
  zero_reference: string
  // The typed name; empty while the name follows the generated one.
  name: string
  split: boolean
  importance_below: number
  importance_above: number
  day_guard_rail: boolean
  // null while it follows the goal's importance (`guardRailImportance`).
  guard_rail_importance: number | null
}

export const noErrors = { attribute: '', min: '', max: '', reference: '', name: '', below: '', above: '', guardRail: '', save: '' }

/** What the editor marks wrong, by field; '' for nothing. */
export type GoalErrors = typeof noErrors

/** The draft for `goal` as stored, or for a new goal on the first attribute. */
export function draftFromGoal(goal: Goal | null, attributes: Pick<Attribute, 'id'>[]): GoalDraft {
  return {
    attribute_id: goal?.attribute_id ?? attributes[0]?.id ?? 0,
    min: goal?.min ?? '',
    max: goal?.max ?? '',
    applies_to: goal?.applies_to ?? 'day',
    must: goal?.must ?? false,
    importance: goal?.importance ?? IMPORTANCE.default,
    zero_reference: goal?.zero_reference ?? '',
    name: goal?.custom_name ?? '',
    split: goal?.importance_below != null || goal?.importance_above != null,
    importance_below: goal?.importance_below ?? goal?.importance ?? IMPORTANCE.default,
    importance_above: goal?.importance_above ?? goal?.importance ?? IMPORTANCE.default,
    day_guard_rail: goal?.day_guard_rail ?? true,
    guard_rail_importance: goal?.guard_rail_importance ?? null,
  }
}

/** Open for a goal with advanced settings (the server keeps only those that apply). */
export function opensAdvanced(goal: Goal | null, draft: GoalDraft): boolean {
  return !!goal && (draft.name !== '' || draft.split || !draft.day_guard_rail || draft.guard_rail_importance !== null)
}

/** A bound as typed, for the rule on the zero-bound field: null if empty. */
function bound(text: string) {
  return text.trim() === '' ? null : text
}

/** Whether the zero-bound field shows (`needsZeroReference`). */
export function showsReference(draft: GoalDraft): boolean {
  return needsZeroReference({ ...draft, min: bound(draft.min), max: bound(draft.max) })
}

/** Importance below and above: for a Prefer goal with both bounds. */
export function showsSplit(draft: GoalDraft): boolean {
  return !draft.must && bound(draft.min) !== null && bound(draft.max) !== null
}

/** The day guard-rail: for a daily average. */
export function showsGuardRail(draft: GoalDraft): boolean {
  return draft.applies_to === 'daily_average'
}

/** The reference typed, if a number above 0. */
export function typedReference(text: string): string | null {
  const number = typedNumber(text)
  return number !== null && Number(number) > 0 ? number : null
}

/** What is wrong with the bounds and the reference as typed, before sending. */
export function draftErrors(draft: GoalDraft, t: Translate): Pick<GoalErrors, 'min' | 'max' | 'reference'> {
  const min = typedNumber(draft.min)
  const max = typedNumber(draft.max)
  const errors = {
    min: bound(draft.min) !== null && min === null ? t('goals.editor.notNumber', {}) : '',
    max: bound(draft.max) !== null && max === null ? t('goals.editor.notNumber', {}) : '',
    reference: '',
  }
  if (!errors.min && !errors.max && min === null && max === null) errors.min = t('goals.editor.needBound', {})
  if (showsReference(draft) && typedReference(draft.zero_reference) === null) {
    errors.reference = t('goals.editor.referenceNeeded', {})
  }
  return errors
}

/** The goal's fields as the server takes them, from a draft without errors.
 * `customName` is the typed name, or null while the name follows; settings
 * the form hides go as their defaults. */
export function draftFields(draft: GoalDraft, id: number | null, customName: string | null): GoalFields {
  const split = showsSplit(draft) && draft.split
  const guardRail = !showsGuardRail(draft) || draft.day_guard_rail
  return {
    id,
    attribute_id: draft.attribute_id,
    min: typedNumber(draft.min),
    max: typedNumber(draft.max),
    applies_to: draft.applies_to,
    must: draft.must,
    importance: draft.importance,
    zero_reference: showsReference(draft) ? typedReference(draft.zero_reference) : null,
    custom_name: customName,
    importance_below: split ? draft.importance_below : null,
    importance_above: split ? draft.importance_above : null,
    day_guard_rail: guardRail,
    guard_rail_importance: showsGuardRail(draft) && guardRail ? draft.guard_rail_importance : null,
  }
}

/** What the server refused on the goal at `index` of the goals sent, as the
 * editor marks it; `save` says the save failed when no field is marked.
 * `attribute` is the goal's, for what a refused bound says. */
export function serverErrors(
  found: Partial<Record<string, string>>,
  index: number,
  attribute: Pick<Attribute, 'name' | 'decimals'> | undefined,
  t: Translate,
): GoalErrors {
  const at = (field: string) => found[`goals.${index}.${field}`]
  const importance = (field: string) => (at(field) ? t('goals.editor.importanceInvalid', IMPORTANCE) : '')
  const errors = {
    attribute: at('attribute_id') ? t('goals.editor.unknownAttribute', {}) : '',
    min: boundError(at('min'), attribute, t),
    max: boundError(at('max'), attribute, t),
    reference: at('zero_reference') ? t('goals.editor.referenceNeeded', {}) : '',
    name:
      at('custom_name') === 'duplicate'
        ? t('goals.editor.nameInUse', {})
        : at('custom_name')
          ? t('goals.editor.nameTooLong', { n: NAME_LENGTH })
          : '',
    below: importance('importance_below'),
    above: importance('importance_above'),
    guardRail: at('day_guard_rail') ? t('goals.editor.settingRefused', {}) : importance('guard_rail_importance'),
    save: '',
  }
  const marked = errors.attribute || errors.min || errors.max || errors.reference || advancedMarked(errors)
  errors.save = marked ? '' : t('common.saveFailed', {})
  return errors
}

/** Whether an error is marked in the Advanced section. */
export function advancedMarked(errors: GoalErrors): boolean {
  return !!(errors.name || errors.below || errors.above || errors.guardRail)
}

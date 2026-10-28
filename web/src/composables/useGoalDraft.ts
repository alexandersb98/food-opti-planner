import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, Goal, GoalFields, Plan } from '../api/types'
import { boundError, goalNames, guardRailImportance, IMPORTANCE, NAME_LENGTH, needsZeroReference, type Translate } from '../goals'
import { typedNumber } from '../numbers'
import { goalFields, planFields, useSavePlan } from '../plan'

// The goal editor's draft (A3, A3b): the fields as typed, which of them show,
// what is wrong with them, and the goal they make. The pure parts are
// exported apart, so they can be tested without the dialog.

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

const noErrors = { attribute: '', min: '', max: '', reference: '', name: '', below: '', above: '', guardRail: '', save: '' }

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

/** The goal editor's state for `props.goal` (null for a new goal) in
 * `props.plan`. `fill` starts it over from the goal, when the editor opens.
 * `save` and `remove` send the setup with the goal added, changed or
 * removed, and give the saved setup, or null with the errors marked. */
export function useGoalDraft(props: { plan: Plan; attributes: Attribute[]; goal: Goal | null }) {
  const { t } = useI18n()
  const draft = reactive(draftFromGoal(null, []))
  const errors = reactive({ ...noErrors })
  const { saving, savePlan } = useSavePlan()
  const advanced = ref(false)
  // Whether the name field shows the generated name: until the user types in
  // it, and again once it is left empty.
  const nameFollows = ref(true)

  function fill() {
    Object.assign(draft, draftFromGoal(props.goal, props.attributes))
    nameFollows.value = !props.goal?.custom_name
    advanced.value = opensAdvanced(props.goal, draft)
    clearErrors()
  }

  function clearErrors() {
    Object.assign(errors, noErrors)
  }

  const attribute = computed(() => props.attributes.find(({ id }) => id === draft.attribute_id))
  const unit = computed(() => attribute.value?.unit ?? '')
  const showReference = computed(() => showsReference(draft))

  /** Where the goal is among the goals sent: its place, or last when new. */
  const index = computed(() => {
    const place = props.plan.goals.findIndex(({ id }) => id === props.goal?.id)
    return place < 0 ? props.plan.goals.length : place
  })

  /** The name the goal gets while it follows: generated, numbered among the
   * plan's goals with this one in its place, or last when new. */
  const generatedName = computed(() => {
    const goals = props.plan.goals.map(({ attribute_id, applies_to, custom_name }) => ({ attribute_id, applies_to, custom_name }))
    const own = { attribute_id: draft.attribute_id, applies_to: draft.applies_to, custom_name: null }
    if (props.goal) goals[index.value] = own
    else goals.push(own)
    return goalNames(goals, props.attributes)[index.value]
  })

  const nameShown = computed(() => (nameFollows.value ? generatedName.value : draft.name))

  /** The typed name, trimmed, or null while the name follows. */
  const customName = computed(() => (nameFollows.value || draft.name.trim() === '' ? null : draft.name.trim()))

  function typeName(text: string | number | null) {
    draft.name = String(text ?? '')
    nameFollows.value = false
  }

  /** Leaving the name empty goes back to the generated one. */
  function leaveName() {
    if (draft.name.trim() === '') nameFollows.value = true
  }

  const showSplit = computed(() => showsSplit(draft))
  const split = computed(() => showSplit.value && draft.split)

  /** Turned on, both sides start at the goal's importance. */
  function setSplit(on: boolean) {
    draft.split = on
    if (on) Object.assign(draft, { importance_below: draft.importance, importance_above: draft.importance })
  }

  const showGuardRail = computed(() => showsGuardRail(draft))

  const guardRailShown = computed(() =>
    guardRailImportance({
      ...draft,
      importance_below: split.value ? draft.importance_below : null,
      importance_above: split.value ? draft.importance_above : null,
    }),
  )

  const reference = computed(() => typedReference(draft.zero_reference))

  /** The goal's fields as the server takes them, or null with the errors marked. */
  function fields(): GoalFields | null {
    clearErrors()
    Object.assign(errors, draftErrors(draft, t))
    if (errors.min || errors.max || errors.reference) return null
    return draftFields(draft, props.goal?.id ?? null, customName.value)
  }

  /** `index` is where the goal is among `goals`, or null when none is to be marked. */
  async function send(goals: GoalFields[], index: number | null): Promise<Plan | null> {
    const saved = await savePlan({ ...planFields(props.plan), goals })
    if (saved.plan) return saved.plan
    if (index === null) errors.save = t('common.saveFailed')
    else {
      Object.assign(errors, serverErrors(saved.errors, index, attribute.value, t))
      if (advancedMarked(errors)) advanced.value = true
    }
    return null
  }

  async function save() {
    const goal = fields()
    if (!goal) return null
    const goals = props.plan.goals.map(goalFields)
    if (props.goal) goals[index.value] = goal
    else goals.push(goal)
    return send(goals, index.value)
  }

  async function remove() {
    errors.save = ''
    return send(props.plan.goals.filter(({ id }) => id !== props.goal?.id).map(goalFields), null)
  }

  return {
    draft,
    errors,
    saving,
    advanced,
    nameFollows,
    fill,
    unit,
    reference,
    showReference,
    generatedName,
    nameShown,
    typeName,
    leaveName,
    showSplit,
    split,
    setSplit,
    showGuardRail,
    guardRailShown,
    save,
    remove,
  }
}

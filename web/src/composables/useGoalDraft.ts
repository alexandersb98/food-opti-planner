import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, Goal, GoalFields, Plan } from '../api/types'
import {
  advancedMarked,
  draftErrors,
  draftFields,
  draftFromGoal,
  noErrors,
  opensAdvanced,
  serverErrors,
  showsGuardRail,
  showsReference,
  showsSplit,
  typedReference,
} from '../goalDraft'
import { goalNames, guardRailImportance } from '../goals'
import { useSavePlan } from '../plan'
import { goalFields, planFields } from '../planFields'

// The goal editor's draft in Vue: the rules (`../goalDraft`) held in reactive
// state, with saving and removing the goal.

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

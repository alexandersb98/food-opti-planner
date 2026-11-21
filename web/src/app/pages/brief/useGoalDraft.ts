import { useState } from 'react'
import type { Attribute, Goal, GoalFields, Plan } from '../../../api/types'
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
  type GoalDraft,
  type GoalErrors,
} from '../../../goalDraft'
import { goalNames, guardRailImportance } from '../../../goals'
import { goalFields } from '../../../planFields'
import { useT } from '../../i18n/i18n'
import * as planSetup from '../../stores/planSetup'

// The goal sheet's draft in React: the pure rules (`src/goalDraft.ts`) held
// in state, with saving and removing the goal through the plan-setup store.

/** How a save or a removal ended: the saved setup, or null with the errors
 * marked (the sheet stays open). */
export type GoalSaved = Plan | null

/** The goals as a setup change takes them: the plan's `Goal` type wants an
 * id and the answered name, which a new goal has not; `planFields` sends
 * only the fields the server takes. */
const asGoals = (goals: GoalFields[]) => goals as unknown as Goal[]

/**
 * The goal sheet's state for `goal` (null for a new goal) in `plan`. Mount
 * it once per opening (the sheet keys its form): the draft starts from the
 * goal as stored. `save` and `remove` send the whole setup with the goal
 * added, changed or removed, and give the saved setup, or null with the
 * errors marked.
 */
export function useGoalDraft({ plan, attributes, goal }: { plan: Plan; attributes: Attribute[]; goal: Goal | null }) {
  const t = useT()
  const [draft, setDraft] = useState<GoalDraft>(() => draftFromGoal(goal, attributes))
  const [errors, setErrors] = useState<GoalErrors>(noErrors)
  const [saving, setSaving] = useState(false)
  // Opened at the start for a goal with advanced settings.
  const [advancedAtStart] = useState(() => opensAdvanced(goal, draftFromGoal(goal, attributes)))
  // Whether the name field shows the generated name: until the user types in
  // it, and again once it is left empty.
  const [nameFollows, setNameFollows] = useState(!goal?.custom_name)

  const attribute = attributes.find(({ id }) => id === draft.attribute_id)
  const unit = attribute?.unit ?? ''

  /** Where the goal is among the plan's goals: its place, or last when new. */
  const place = plan.goals.findIndex(({ id }) => id === goal?.id)
  const index = goal && place >= 0 ? place : plan.goals.length

  /** The name the goal gets while it follows: generated, numbered among the
   * plan's goals with this one in its place, or last when new. */
  const names = plan.goals.map(({ attribute_id, applies_to, custom_name }) => ({ attribute_id, applies_to, custom_name }))
  names[index] = { attribute_id: draft.attribute_id, applies_to: draft.applies_to, custom_name: null }
  const generatedName = goalNames(names, attributes)[index] ?? ''
  const nameShown = nameFollows ? generatedName : draft.name

  /** Changes fields of the draft; an edit clears the general save error. */
  function edit(change: Partial<GoalDraft>) {
    setDraft((current) => ({ ...current, ...change }))
    setErrors((current) => (current.save ? { ...current, save: '' } : current))
  }

  function typeName(text: string) {
    edit({ name: text })
    setNameFollows(false)
  }

  /** Leaving the name empty goes back to the generated one. */
  function leaveName() {
    if (draft.name.trim() === '') setNameFollows(true)
  }

  const showSplit = showsSplit(draft)
  const split = showSplit && draft.split

  /** Turned on, both sides start at the goal's importance. */
  function setSplit(on: boolean) {
    edit(on ? { split: on, importance_below: draft.importance, importance_above: draft.importance } : { split: on })
  }

  const guardRailShown = guardRailImportance({
    ...draft,
    importance_below: split ? draft.importance_below : null,
    importance_above: split ? draft.importance_above : null,
  })

  /** Sends `goals`; `at` is where the goal is among them, or null when none
   * is to be marked (a removal). */
  async function send(goals: (latest: Plan) => { goals: GoalFields[]; at: number | null }): Promise<GoalSaved> {
    setErrors(noErrors)
    setSaving(true)
    let at: number | null = null
    const saved = await planSetup.change(
      (latest) => {
        const sent = goals(latest)
        at = sent.at
        return { ...latest, goals: asGoals(sent.goals) }
      },
      { optimistic: false },
    )
    setSaving(false)
    if (saved.plan) return saved.plan
    if (at === null) setErrors({ ...noErrors, save: t('common.saveFailed') })
    else setErrors(serverErrors(saved.errors, at, attribute, t))
    return null
  }

  async function save(): Promise<GoalSaved> {
    if (saving) return null
    const found = { ...noErrors, ...draftErrors(draft, t) }
    if (found.min || found.max || found.reference) {
      setErrors(found)
      return null
    }
    const customName = nameFollows || draft.name.trim() === '' ? null : draft.name.trim()
    const fields = draftFields(draft, goal?.id ?? null, customName)
    // Applied to the latest saved setup: the goal in its place, or last.
    return send((latest) => {
      const goals = latest.goals.map(goalFields)
      const at = goal ? latest.goals.findIndex(({ id }) => id === goal.id) : -1
      if (at >= 0) {
        goals[at] = fields
        return { goals, at }
      }
      goals.push(fields)
      return { goals, at: goals.length - 1 }
    })
  }

  async function remove(): Promise<GoalSaved> {
    if (saving) return null
    return send((latest) => ({
      goals: latest.goals.filter(({ id }) => id !== goal?.id).map(goalFields),
      at: null,
    }))
  }

  return {
    draft,
    edit,
    errors,
    saving,
    /** Whether the Advanced part should be open: at the start for a goal
     * using it, and whenever an error is marked inside it. */
    advancedOpen: advancedAtStart || advancedMarked(errors),
    unit,
    attribute,
    reference: typedReference(draft.zero_reference),
    showReference: showsReference(draft),
    generatedName,
    nameFollows,
    nameShown,
    typeName,
    leaveName,
    showSplit,
    split,
    setSplit,
    showGuardRail: showsGuardRail(draft),
    guardRailShown,
    save,
    remove,
  }
}
